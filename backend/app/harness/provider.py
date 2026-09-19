"""Select the offline demonstration or the official TrueForge runtime."""
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


from app.harness.trueforge import TrueForgeHarnessProvider


def get_harness_provider() -> HarnessProvider:
    if settings.harness_provider == "trueforge":
        return TrueForgeHarnessProvider()
    if settings.harness_provider == "local":
        return LocalHarnessProvider()
    raise ValueError("HARNESS_PROVIDER must be local or trueforge")


harness_provider = get_harness_provider()
