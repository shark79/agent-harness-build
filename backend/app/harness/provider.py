"""HarnessProvider - the pluggable "backend" for running the harness loop.

LocalHarnessProvider is what's actually used: it wires PermissionEngine +
ApprovalEngine + ToolRegistry + TraceRecorder into a HarnessOrchestrator
running in this same process. TrueForgeHarnessProvider is a documented,
NotImplemented extension point (see its docstring) for a future managed
harness backend - do not guess at that SDK's API.
"""
from abc import ABC, abstractmethod

from app.config import settings
from app.harness.approvals import ApprovalEngine
from app.harness.orchestrator import HarnessOrchestrator
from app.harness.permissions import PermissionEngine
from app.harness.tracing import TraceRecorder
from app.models.db import async_session_factory
from app.services.events import event_bus
from app.tools.registry import tool_registry


class HarnessProvider(ABC):
    @abstractmethod
    async def start_run(self, run_id: str, task: str, force_model_failure: bool = False) -> None: ...

    @abstractmethod
    async def resolve_approval(self, run_id: str, approval_id: str, decision: str) -> None: ...


class LocalHarnessProvider(HarnessProvider):
    def __init__(self, session_factory=async_session_factory) -> None:
        self._orchestrator = HarnessOrchestrator(
            session_factory=session_factory,
            permission_engine=PermissionEngine(tool_registry),
            approval_engine=ApprovalEngine(session_factory),
            tool_registry=tool_registry,
            trace_recorder=TraceRecorder(session_factory, event_bus),
        )

    async def start_run(self, run_id: str, task: str, force_model_failure: bool = False) -> None:
        await self._orchestrator.start_run(run_id, task, force_model_failure=force_model_failure)

    async def resolve_approval(self, run_id: str, approval_id: str, decision: str) -> None:
        await self._orchestrator.resolve_approval(run_id, approval_id, decision)


class TrueForgeHarnessProvider(HarnessProvider):
    """Extension point for a future TrueFoundry/"TrueForge" managed harness
    backend. NOT IMPLEMENTED: no TrueFoundry/TrueForge SDK or package is
    installed anywhere in this project, and its exact API surface is unknown
    - this class deliberately does not guess at it.

    To wire up a real integration, implement the same interface as
    LocalHarnessProvider:
      - start_run(run_id, task): submit the task to the managed service
        instead of the in-process HarnessOrchestrator.
      - resolve_approval(run_id, approval_id, decision): forward the human
        decision to that service.
      - Translate whatever callback/webhook/polling mechanism the service
        uses back into TraceEvent rows via the same TraceRecorder shape
        LocalHarnessProvider uses, so nothing else in this app (API routes,
        the SSE stream, GET /api/runs/{id}) needs to change.
    """

    def __init__(self, *args, **kwargs) -> None:
        raise NotImplementedError(
            "TrueForgeHarnessProvider is a documented extension point only - "
            "see this class's docstring for what a real integration needs to wire up."
        )

    async def start_run(self, run_id: str, task: str, force_model_failure: bool = False) -> None:
        raise NotImplementedError

    async def resolve_approval(self, run_id: str, approval_id: str, decision: str) -> None:
        raise NotImplementedError


def get_harness_provider() -> HarnessProvider:
    if settings.harness_provider == "trueforge":
        return TrueForgeHarnessProvider()
    return LocalHarnessProvider()


harness_provider = get_harness_provider()
