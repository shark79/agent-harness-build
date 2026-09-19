"""HarnessOrchestrator - the loop: Agent -> requests tool -> PermissionEngine
-> (ApprovalEngine if needed, which may pause the loop) -> ToolRegistry ->
execute -> TraceRecorder -> result -> Agent -> ... -> done.

Extension points left deliberately open for the next dispatch:
  - retry: wrap the `await self._tools.execute(...)` call in _execute_and_continue
    with retry.py's (currently no-op) wrapper, incrementing Run.retry_count and
    transitioning through RunStatus.RETRYING on failure.
  - budget: check budget.py before each `_call_model` (or after, using the
    accumulated Run.tokens/estimated_cost this dispatch already maintains) and
    transition to RunStatus.BUDGET_EXCEEDED instead of continuing the loop.
  - routing: `_call_model` is the single seam where a model call happens: on
    failure, routing.py's model choice can swap PRIMARY_MODEL for
    FALLBACK_MODEL there without changing the surrounding loop.
  - evaluator: after `_complete_run`, evaluator.py can be invoked with run_id
    to emit EVALUATION_STARTED/EVALUATION_COMPLETED trace events and persist
    Evaluation rows - the trace event types already exist for this.
Nothing above is implemented yet; this dispatch only leaves the seams.
"""
import time
from dataclasses import dataclass
from datetime import datetime, timezone

from app.agent.adapter import AgentAdapter, AgentStep, get_agent_adapter
from app.harness.approvals import ApprovalEngine
from app.harness.permissions import PermissionEngine
from app.harness.tracing import TraceRecorder
from app.models.run import Run, RunStatus
from app.models.trace_event import TraceEventType
from app.tools.registry import Permission, ToolRegistry


def _aware(dt: datetime) -> datetime:
    """Normalize a datetime that may have come back tz-naive from the DB
    driver (sqlite always does; some postgres configs do too, since the
    columns here don't declare timezone=True) so latency math never raises
    "can't subtract offset-naive and offset-aware datetimes".
    """
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


@dataclass
class _ActiveRun:
    adapter: AgentAdapter
    pending_step: AgentStep | None = None


class HarnessOrchestrator:
    def __init__(
        self,
        session_factory,
        permission_engine: PermissionEngine,
        approval_engine: ApprovalEngine,
        tool_registry: ToolRegistry,
        trace_recorder: TraceRecorder,
        agent_factory=get_agent_adapter,
    ) -> None:
        self._session_factory = session_factory
        self._permissions = permission_engine
        self._approvals = approval_engine
        self._tools = tool_registry
        self._tracer = trace_recorder
        self._agent_factory = agent_factory
        # Per-run in-memory state (adapter instance + any tool call paused on
        # approval). Single-process hackathon demo - see services/events.py
        # for the same tradeoff on the SSE side.
        self._active: dict[str, _ActiveRun] = {}

    async def start_run(self, run_id: str, task: str) -> None:
        adapter = self._agent_factory()
        self._active[run_id] = _ActiveRun(adapter=adapter)
        await self._update_run(
            run_id,
            status=RunStatus.RUNNING.value,
            started_at=datetime.now(timezone.utc),
            model=getattr(adapter, "model_name", None),
        )
        await self._tracer.record(run_id, TraceEventType.RUN_STARTED, name="run", metadata={"task": task})
        try:
            step = await self._call_model(run_id, adapter, task=task)
            await self._drive(run_id, step)
        except Exception as exc:  # noqa: BLE001 - top-level run guard
            await self._fail_run(run_id, exc)

    async def resolve_approval(self, run_id: str, approval_id: str, decision: str) -> None:
        approval = await self._approvals.resolve(approval_id, decision)
        if approval.run_id != run_id:
            raise ValueError(f"approval {approval_id} does not belong to run {run_id}")
        active = self._active.get(run_id)
        if active is None or active.pending_step is None:
            raise ValueError(f"run {run_id} has no pending approval-gated tool call")
        step = active.pending_step
        active.pending_step = None

        try:
            if decision == "approve":
                await self._tracer.record(
                    run_id, TraceEventType.APPROVAL_GRANTED, name=step.tool_name, status="approved",
                    metadata={"approval_id": approval_id},
                )
                await self._update_run(run_id, status=RunStatus.RUNNING.value)
                next_step = await self._execute_and_continue(run_id, step)
            else:
                await self._tracer.record(
                    run_id, TraceEventType.APPROVAL_DENIED, name=step.tool_name, status="denied",
                    metadata={"approval_id": approval_id},
                )
                await self._update_run(run_id, status=RunStatus.RUNNING.value)
                tool_result = {"error": "denied", "tool": step.tool_name}
                next_step = await self._call_model(run_id, active.adapter, tool_result=tool_result)
            await self._drive(run_id, next_step)
        except Exception as exc:  # noqa: BLE001
            await self._fail_run(run_id, exc)

    # -- the loop -------------------------------------------------------

    async def _drive(self, run_id: str, step: AgentStep) -> None:
        while True:
            if step.kind == "done":
                await self._complete_run(run_id, step.result_text)
                return

            await self._tracer.record(
                run_id, TraceEventType.TOOL_REQUESTED, name=step.tool_name, metadata={"args": step.tool_args}
            )
            decision = self._permissions.check(step.tool_name)
            await self._tracer.record(
                run_id, TraceEventType.PERMISSION_CHECK, name=step.tool_name, status=decision.value,
                metadata={"decision": decision.value},
            )

            if decision == Permission.DENY:
                tool_result = {"error": "denied", "tool": step.tool_name}
                step = await self._call_model(run_id, self._active[run_id].adapter, tool_result=tool_result)
                continue

            if decision == Permission.REQUIRE_APPROVAL:
                approval = await self._approvals.create(run_id, step.tool_name, step.tool_args)
                await self._tracer.record(
                    run_id, TraceEventType.APPROVAL_REQUIRED, name=step.tool_name, status="pending",
                    metadata={"approval_id": approval.id, "args": step.tool_args},
                )
                await self._update_run(run_id, status=RunStatus.WAITING_FOR_APPROVAL.value)
                self._active[run_id].pending_step = step
                return  # pause - resumed later via resolve_approval()

            step = await self._execute_and_continue(run_id, step)

    async def _execute_and_continue(self, run_id: str, step: AgentStep) -> AgentStep:
        await self._tracer.record(
            run_id, TraceEventType.TOOL_STARTED, name=step.tool_name, metadata={"args": step.tool_args}
        )
        t0 = time.monotonic()
        try:
            result = await self._tools.execute(step.tool_name, step.tool_args)
            latency_ms = int((time.monotonic() - t0) * 1000)
            await self._tracer.record(
                run_id, TraceEventType.TOOL_COMPLETED, name=step.tool_name, status="success",
                latency_ms=latency_ms, metadata={"result": result},
            )
        except Exception as exc:  # noqa: BLE001 - fed back to the agent, not a hard crash
            latency_ms = int((time.monotonic() - t0) * 1000)
            await self._tracer.record(
                run_id, TraceEventType.TOOL_FAILED, name=step.tool_name, status="error",
                latency_ms=latency_ms, metadata={"error": str(exc)},
            )
            result = {"error": str(exc)}
        await self._increment_tool_calls(run_id)
        return await self._call_model(run_id, self._active[run_id].adapter, tool_result=result)

    async def _call_model(self, run_id: str, adapter: AgentAdapter, *, task: str | None = None, tool_result: dict | None = None) -> AgentStep:
        model_name = getattr(adapter, "model_name", "model")
        await self._tracer.record(run_id, TraceEventType.MODEL_CALL_STARTED, name=model_name)
        t0 = time.monotonic()
        if tool_result is None:
            step = await adapter.run(task or "", {})
        else:
            step = await adapter.resume(run_id, tool_result)
        latency_ms = int((time.monotonic() - t0) * 1000)
        usage = adapter.get_usage()
        await self._tracer.record(
            run_id, TraceEventType.MODEL_CALL_COMPLETED, name=model_name, latency_ms=latency_ms,
            metadata={"tokens": usage.total_tokens},
        )
        await self._add_tokens(run_id, usage.total_tokens)
        return step

    # -- terminal states --------------------------------------------------

    async def _complete_run(self, run_id: str, result_text: str | None) -> None:
        await self._tracer.record(
            run_id, TraceEventType.RUN_COMPLETED, status="completed", metadata={"result": result_text}
        )
        now = datetime.now(timezone.utc)
        await self._update_run(run_id, status=RunStatus.COMPLETED.value, completed_at=now, result=result_text, compute_latency_at=now)
        self._active.pop(run_id, None)

    async def _fail_run(self, run_id: str, exc: Exception) -> None:
        await self._tracer.record(run_id, TraceEventType.RUN_FAILED, status="failed", metadata={"error": str(exc)})
        now = datetime.now(timezone.utc)
        await self._update_run(run_id, status=RunStatus.FAILED.value, completed_at=now, compute_latency_at=now)
        self._active.pop(run_id, None)

    # -- Run row helpers ----------------------------------------------------

    async def _update_run(self, run_id: str, *, compute_latency_at: datetime | None = None, **fields) -> None:
        async with self._session_factory() as session:
            run = await session.get(Run, run_id)
            if run is None:
                return
            for key, value in fields.items():
                setattr(run, key, value)
            if compute_latency_at is not None and run.started_at is not None:
                run.latency_ms = int((_aware(compute_latency_at) - _aware(run.started_at)).total_seconds() * 1000)
            await session.commit()

    async def _add_tokens(self, run_id: str, tokens: int) -> None:
        async with self._session_factory() as session:
            run = await session.get(Run, run_id)
            if run is not None:
                run.tokens = (run.tokens or 0) + tokens
                await session.commit()

    async def _increment_tool_calls(self, run_id: str) -> None:
        async with self._session_factory() as session:
            run = await session.get(Run, run_id)
            if run is not None:
                run.tool_calls = (run.tool_calls or 0) + 1
                await session.commit()
