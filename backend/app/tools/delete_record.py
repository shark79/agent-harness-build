"""delete_record has DENY permission and intentionally has no working
implementation - it exists purely so PermissionEngine has something to
demonstrably deny. ToolRegistry never wires a callable for it (see
registry.py), so there is no code path that can execute it even if it were
somehow requested.
"""
