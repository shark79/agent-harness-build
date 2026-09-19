from argparse import Namespace
import pytest
from app.trueforge_setup import manifest


def args(**changes):
    return Namespace(**({"model": "provider/model", "search_server": "search", "search_tool": ["search", "fetch"],
        "delivery_server": "mail", "delivery_tool": "deliver", "sandbox": False, "skill": []} | changes))


def test_recipe_has_explicit_delivery_gate_and_bounded_execution():
    spec = manifest(args())
    assert spec["mcp_servers"][1]["require_approval_for_tools"] == ["@all"]
    assert spec["mcp_servers"][1]["enable_tools"] == ["deliver"]
    assert spec["config"]["iteration_limit"] == 30
    assert not spec["config"]["sandbox"]["enabled"]
    assert not spec["config"]["context_management"]["large_tool_response"]["enabled"]


def test_skill_requires_sandbox():
    with pytest.raises(ValueError, match="Skills require"):
        manifest(args(skill=["report"]))
    spec = manifest(args(skill=["report"], sandbox=True))
    assert spec["skills"][0]["name"] == "report"
    assert spec["config"]["sandbox"]["enabled"]
