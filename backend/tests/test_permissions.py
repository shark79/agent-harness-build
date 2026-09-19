from app.harness.permissions import PermissionEngine
from app.tools.registry import Permission, ToolRegistry


def test_web_search_is_allowed():
    engine = PermissionEngine(ToolRegistry())
    assert engine.check("web_search") == Permission.ALLOW


def test_calculator_is_allowed():
    engine = PermissionEngine(ToolRegistry())
    assert engine.check("calculator") == Permission.ALLOW


def test_send_email_requires_approval():
    engine = PermissionEngine(ToolRegistry())
    assert engine.check("send_email") == Permission.REQUIRE_APPROVAL


def test_delete_record_is_denied():
    engine = PermissionEngine(ToolRegistry())
    assert engine.check("delete_record") == Permission.DENY
