"""HarnessOrchestrator - the loop: Agent -> requests tool -> PermissionEngine
-> (ApprovalEngine if needed, which may pause the loop) -> ToolRegistry ->
execute -> TraceRecorder -> result -> Agent -> ... -> done.

Retry/routing/budget are all wired through the single `_call_model` seam:
  - retry: each model call attempt goes through retry.with_retry, which
    retries RetryableModelError up to MAX_ATTEMPTS times (recording
    RETRY_STARTED + Run.retry_count between attempts) and lets
    NonRetryableModelError through immediately to fail the run.
  - routing: on RetryExhausted, the run's ModelRouter switches from
    PRIMARY_MODEL to FALLBACK_MODEL (recording FALLBACK_TRIGGERED) and the
    call is retried once more on the fallback model.
  - budget: usage/cost are added to the Run row after every model call and
    checked against MAX_RUN_TOKENS/MAX_RUN_COST, recording BUDGET_WARNING at
    ~80% and stopping the run gracefully (RunStatus.BUDGET_EXCEEDED) at 100%.
Evaluation (evaluator.py) is invoked on demand via POST /api/runs/{id}/evaluate,
not automatically from here - see app/api/runs.py.
"""
import time
from dataclasses import dataclass
from datetime import datetime, timezone

from app.agent.adapter import AgentAdapter, AgentStep, get_agent_adapter
from app.config import settings
from app.harness import budget
from app.harness.approvals import ApprovalEngine
from app.harness.budget import BudgetExceededError, BudgetStatus
from app.harness.permissions import PermissionEngine
from app.harness.retry import RetryExhausted, with_retry
from app.harness.routing import ModelRouter
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
    router: ModelRouter
    pending_step: AgentStep | None = None
    budget_warned: bool = False


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

    async def start_run(self, run_id: str, task: str, force_model_failure: bool = False) -> None:
        adapter = self._agent_factory()
        router = ModelRouter(force_failure=force_model_failure or settings.demo_force_model_failure)
        self._active[run_id] = _ActiveRun(adapter=adapter, router=router)
        await self._update_run(
            run_id,
            status=RunStatus.RUNNING.value,
            started_at=datetime.now(timezone.utc),
            model=router.current_model,
        )
        await self._tracer.record(run_id, TraceEventType.RUN_STARTED, name="run", metadata={"task": task})
        try:
            step = await self._call_model(run_id, adapter, task=task)
            await self._drive(run_id, step)
        except BudgetExceededError as exc:
            await self._budget_stop(run_id, exc.step)
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
        except BudgetExceededError as exc:
            await self._budget_stop(run_id, exc.step)
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
        active = self._active[run_id]
        router = active.router

        async def _attempt() -> tuple[AgentStep, str, int]:
            model_name = router.current_model
            await self._tracer.record(run_id, TraceEventType.MODEL_CALL_STARTED, name=model_name)
            # Forced-failure demo simulation deliberately raises *after* the
            # MODEL_CALL_STARTED trace event, matching what a real provider
            # failure mid-call would look like.
            router.maybe_force_failure()
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
            return step, model_name, usage.total_tokens

        async def _on_retry(attempt: int, exc: Exception) -> None:
            await self._tracer.record(
                run_id, TraceEventType.RETRY_STARTED, name=router.current_model,
                metadata={"attempt": attempt, "error": str(exc)},
            )
            await self._increment_retry_count(run_id)

        try:
            step, model_name, tokens = await with_retry(_attempt, on_retry=_on_retry)
        except RetryExhausted as exc:
            if router.fallback_triggered:
                raise  # already tried the fallback and it also failed - hard fail the run
            router.trigger_fallback()
            await self._tracer.record(
                run_id, TraceEventType.FALLBACK_TRIGGERED, name=router.current_model,
                metadata={"reason": str(exc.last_error)},
            )
            await self._update_run(run_id, model=router.current_model)
            step, model_name, tokens = await _attempt()

        tokens_total, cost_total = await self._add_usage(run_id, model_name, tokens)
        check = budget.check_budget(tokens_total, cost_total)
        if check.status == BudgetStatus.EXCEEDED:
            await self._tracer.record(
                run_id, TraceEventType.BUDGET_EXCEEDED, status="budget_exceeded",
                metadata={"tokens": tokens_total, "estimated_cost": cost_total},
            )
            await self._update_run(run_id, status=RunStatus.BUDGET_EXCEEDED.value)
            raise BudgetExceededError(step)
        if check.status == BudgetStatus.WARNING and not active.budget_warned:
            active.budget_warned = True
            await self._tracer.record(
                run_id, TraceEventType.BUDGET_WARNING, status="warning",
                metadata={"tokens": tokens_total, "estimated_cost": cost_total},
            )
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

    async def _budget_stop(self, run_id: str, step: AgentStep | None) -> None:
        partial = step.result_text if step is not None and step.kind == "done" else None
        result_text = "[BUDGET_EXCEEDED] Run stopped: exceeded configured token/cost budget (Estimated Cost)."
        if partial:
            result_text += f" Partial result: {partial}"
        now = datetime.now(timezone.utc)
        await self._update_run(
            run_id, status=RunStatus.BUDGET_EXCEEDED.value, completed_at=now, result=result_text,
            compute_latency_at=now,
        )
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

    async def _add_usage(self, run_id: str, model_name: str, tokens: int) -> tuple[int, float]:
        async with self._session_factory() as session:
            run = await session.get(Run, run_id)
            if run is None:
                return 0, 0.0
            run.tokens = (run.tokens or 0) + tokens
            run.estimated_cost = (run.estimated_cost or 0.0) + budget.estimate_cost(model_name, tokens)
            await session.commit()
            return run.tokens, run.estimated_cost

    async def _increment_tool_calls(self, run_id: str) -> None:
        async with self._session_factory() as session:
            run = await session.get(Run, run_id)
            if run is not None:
                run.tool_calls = (run.tool_calls or 0) + 1
                await session.commit()

    async def _increment_retry_count(self, run_id: str) -> None:
        async with self._session_factory() as session:
            run = await session.get(Run, run_id)
            if run is not None:
                run.retry_count = (run.retry_count or 0) + 1
                await session.commit()
