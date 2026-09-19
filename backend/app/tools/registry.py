from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from enum import StrEnum

from app.tools.calculator import calculator
from app.tools.send_email import send_email
from app.tools.web_search import web_search


class Permission(StrEnum):
    ALLOW = "ALLOW"
    DENY = "DENY"
    REQUIRE_APPROVAL = "REQUIRE_APPROVAL"


class RiskLevel(StrEnum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"


@dataclass(frozen=True)
class ToolMetadata:
    name: str
    description: str
    permission: Permission
    approval_required: bool
    risk_level: RiskLevel
    # None for tools with DENY permission (e.g. delete_record): there is
    # deliberately no callable to execute, so ToolRegistry.execute() cannot
    # reach an execution path for them even if called directly.
    func: Callable[..., Awaitable[dict]] | None


class ToolRegistry:
    def __init__(self) -> None:
        self._tools: dict[str, ToolMetadata] = {}
        self._register_defaults()

    def _register(self, meta: ToolMetadata) -> None:
        self._tools[meta.name] = meta

    def _register_defaults(self) -> None:
        self._register(
            ToolMetadata(
                name="web_search",
                description="Search the web for information relevant to a query.",
                permission=Permission.ALLOW,
                approval_required=False,
                risk_level=RiskLevel.LOW,
                func=web_search,
            )
        )
        self._register(
            ToolMetadata(
                name="send_email",
                description="Send an email with a subject and body to a recipient.",
                permission=Permission.ALLOW,
                approval_required=True,
                risk_level=RiskLevel.MEDIUM,
                func=send_email,
            )
        )
        self._register(
            ToolMetadata(
                name="calculator",
                description="Evaluate a safe arithmetic expression.",
                permission=Permission.ALLOW,
                approval_required=False,
                risk_level=RiskLevel.LOW,
                func=calculator,
            )
        )
        self._register(
            ToolMetadata(
                name="delete_record",
                description="Delete a record. Not implemented - permanently denied by policy.",
                permission=Permission.DENY,
                approval_required=False,
                risk_level=RiskLevel.HIGH,
                func=None,
            )
        )

    def get(self, name: str) -> ToolMetadata:
        if name not in self._tools:
            raise KeyError(f"unknown tool: {name}")
        return self._tools[name]

    def all(self) -> list[ToolMetadata]:
        return list(self._tools.values())

    async def execute(self, name: str, args: dict) -> dict:
        meta = self.get(name)
        if meta.permission == Permission.DENY or meta.func is None:
            raise PermissionError(f"tool '{name}' is denied and cannot be executed")
        return await meta.func(**args)


# Module-level singleton - tool metadata/registration has no per-request
# state, so one shared registry is enough for this single-process demo.
tool_registry = ToolRegistry()
