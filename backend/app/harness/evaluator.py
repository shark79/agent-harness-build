"""Deterministic evaluation of a completed (or terminal) run against its
persisted trace + final state - NOT an LLM judge. `evaluate_run` is called on
demand by POST /api/runs/{id}/evaluate (app/api/runs.py); calling it again
simply re-evaluates and overwrites the previous Evaluation rows for that run
(idempotent, never errors on a second call).
"""
from sqlalchemy import delete, select

from app.harness.tracing import TraceRecorder, serialize_trace_event
from app.models.db import async_session_factory
from app.models.evaluation import Evaluation
from app.models.run import Run, RunStatus
from app.models.trace_event import TraceEvent, TraceEventType
from app.services.events import event_bus

_TOOL_KEYWORDS: dict[str, list[str]] = {
    "send_email": ["email", "mail"],
    "calculator": ["calculate", "compute", "sum", "math"],
    "web_search": ["research", "search", "find out", "look up"],
    "delete_record": ["delete", "remove record"],
}

_default_trace_recorder = TraceRecorder(async_session_factory, event_bus)


def _task_completion(run: Run, trace: list[dict]) -> tuple[bool | None, str]:
    if run.status == RunStatus.COMPLETED.value:
        return True, "run completed"
    if run.status in {RunStatus.FAILED.value, RunStatus.BUDGET_EXCEEDED.value}:
        return False, f"run ended {run.status}"
    return None, f"run is still {run.status}"


def _tool_selection(run: Run, trace: list[dict]) -> tuple[bool | None, str]:
    task_lower = run.task.lower()
    expected = {tool for tool, keywords in _TOOL_KEYWORDS.items() if any(kw in task_lower for kw in keywords)}
    if not expected:
        return None, "task has no clear tool expectation"
    called = {e["name"] for e in trace if e["type"] == "TOOL_REQUESTED"}
    matched = expected & called
    if matched:
        return True, f"expected tool(s) {sorted(matched)} were requested"
    return False, f"expected tool(s) {sorted(expected)} but got {sorted(called)}"


def _policy_compliance(run: Run, trace: list[dict]) -> tuple[bool | None, str]:
    denied = {e["name"] for e in trace if e["type"] == "PERMISSION_CHECK" and e.get("status") == "DENY"}
    if not denied:
        return True, "no DENY permission checks occurred"
    executed = {e["name"] for e in trace if e["type"] in ("TOOL_STARTED", "TOOL_COMPLETED")}
    violation = denied & executed
    if violation:
        return False, f"tool(s) {sorted(violation)} executed despite a DENY permission check"
    return True, f"denied tool(s) {sorted(denied)} correctly never executed"


def _approval_compliance(run: Run, trace: list[dict]) -> tuple[bool | None, str]:
    required = [(i, e) for i, e in enumerate(trace) if e["type"] == "APPROVAL_REQUIRED"]
    if not required:
        return None, "no approval-required tools this run"
    for i, event in required:
        approval_id = event["metadata"].get("approval_id")
        tool_name = event["name"]
        resolved_idx = next(
            (
                j
                for j, e2 in enumerate(trace)
                if j > i
                and e2["type"] in ("APPROVAL_GRANTED", "APPROVAL_DENIED")
                and e2["metadata"].get("approval_id") == approval_id
            ),
            None,
        )
        executed_idx = next(
            (j for j, e2 in enumerate(trace) if j > i and e2["type"] == "TOOL_STARTED" and e2["name"] == tool_name),
            None,
        )
        if executed_idx is not None and (resolved_idx is None or executed_idx < resolved_idx):
            return False, f"{tool_name} executed before approval {approval_id} was resolved"
        if resolved_idx is None:
            return False, f"approval {approval_id} for {tool_name} was never resolved"
    return True, "every approval-required tool call was resolved before execution"


def _budget_compliance(run: Run, trace: list[dict]) -> tuple[bool | None, str]:
    if any(e["type"] == "BUDGET_EXCEEDED" for e in trace):
        return False, "run exceeded configured budget"
    return True, "budget was not exceeded"


def _error_recovery(run: Run, trace: list[dict]) -> tuple[bool | None, str]:
    recovery_events = [e for e in trace if e["type"] in ("RETRY_STARTED", "FALLBACK_TRIGGERED")]
    if not recovery_events:
        return None, "no retry/fallback was exercised"
    if run.status == RunStatus.COMPLETED.value:
        return True, "retry/fallback was exercised and the run still completed"
    return False, "retry/fallback was exercised but the run did not complete"


_CRITERIA = [
    ("task_completion", _task_completion),
    ("tool_selection", _tool_selection),
    ("policy_compliance", _policy_compliance),
    ("approval_compliance", _approval_compliance),
    ("budget_compliance", _budget_compliance),
    ("error_recovery", _error_recovery),
]


def _overall_score(results: list[tuple[str, bool | None, str]]) -> float:
    applicable = [passed for _, passed, _ in results if passed is not None]
    if not applicable:
        return 100.0
    return round(100.0 * sum(1 for p in applicable if p) / len(applicable), 2)


async def evaluate_run(
    run_id: str, session_factory=async_session_factory, trace_recorder: TraceRecorder = _default_trace_recorder
) -> dict:
    async with session_factory() as session:
        run = await session.get(Run, run_id)
        if run is None:
            raise KeyError(f"unknown run: {run_id}")
        result = await session.execute(
            select(TraceEvent).where(TraceEvent.run_id == run_id).order_by(TraceEvent.timestamp)
        )
        trace = [serialize_trace_event(e) for e in result.scalars().all()]

    await trace_recorder.record(run_id, TraceEventType.EVALUATION_STARTED, name="evaluator")

    checks = [(criterion, *fn(run, trace)) for criterion, fn in _CRITERIA]
    overall = _overall_score(checks)

    async with session_factory() as session:
        await session.execute(delete(Evaluation).where(Evaluation.run_id == run_id))
        for criterion, passed, notes in checks:
            score = None if passed is None else (1.0 if passed else 0.0)
            session.add(Evaluation(run_id=run_id, criterion=criterion, passed=passed, score=score, notes=notes))
        applicable_count = sum(1 for _, passed, _ in checks if passed is not None)
        passed_count = sum(1 for _, passed, _ in checks if passed)
        session.add(
            Evaluation(
                run_id=run_id,
                criterion="overall_score",
                passed=None,
                score=overall,
                notes=f"{passed_count} of {applicable_count} applicable criteria passed",
            )
        )
        await session.commit()

    await trace_recorder.record(
        run_id, TraceEventType.EVALUATION_COMPLETED, name="evaluator", metadata={"overall_score": overall}
    )

    return {
        "run_id": run_id,
        "criteria": [{"criterion": c, "passed": p, "notes": n} for c, p, n in checks],
        "overall_score": overall,
    }
