from app.tools.registry import Permission, ToolRegistry


class PermissionEngine:
    """Decides whether a requested tool call may run, driven entirely by the
    tool registry's metadata - never by ad-hoc per-call logic.
    """

    def __init__(self, registry: ToolRegistry) -> None:
        self._registry = registry

    def check(self, tool_name: str) -> Permission:
        meta = self._registry.get(tool_name)
        if meta.permission == Permission.DENY:
            return Permission.DENY
        if meta.approval_required:
            return Permission.REQUIRE_APPROVAL
        return Permission.ALLOW
