import pytest

from app.tools.calculator import calculator
from app.tools.registry import ToolRegistry
from app.tools.send_email import send_email
from app.tools.web_search import web_search


async def test_calculator_evaluates_safe_arithmetic():
    result = await calculator("2 + 3 * 4")
    assert result["result"] == 14


async def test_calculator_rejects_non_arithmetic_expressions():
    with pytest.raises((ValueError, SyntaxError)):
        await calculator("__import__('os').system('echo hacked')")


async def test_web_search_returns_keyed_fixture_and_generic_fallback():
    anthropic_result = await web_search("Tell me about Anthropic")
    assert any("Claude" in r["snippet"] or "Anthropic" in r["title"] for r in anthropic_result["results"])

    fallback_result = await web_search("something with no fixture match at all")
    assert len(fallback_result["results"]) >= 1


async def test_send_email_demo_mode_never_sends_and_reports_sent():
    result = await send_email(to="a@b.com", subject="hi", body="body")
    assert result == {"status": "sent", "mode": "demo", "to": "a@b.com", "subject": "hi"}


async def test_registry_execute_raises_for_denied_tool():
    registry = ToolRegistry()
    with pytest.raises(PermissionError):
        await registry.execute("delete_record", {})
