"""Smoke tests for the 4 named demo scenarios (app/demo/scenarios.py) that the
frontend's 4 DEMO buttons POST as a plain task string. Model-failure and
forbidden-tool scenarios are covered end-to-end in test_retry.py and
test_safety_denial.py respectively; this file covers the remaining one that
needed its own check (human approval with no research needed) plus a basic
sanity check that all 4 are defined.
"""
from app.demo.scenarios import SCENARIOS
from tests.conftest import wait_for_status


def test_all_four_scenarios_are_defined():
    assert set(SCENARIOS) == {"research_and_email", "human_approval", "model_failure", "forbidden_tool"}
    for scenario in SCENARIOS.values():
        assert scenario["task"]


async def test_human_approval_scenario_pauses_for_approval_with_no_research_needed(client):
    task = SCENARIOS["human_approval"]["task"]
    assert "research" not in task.lower()

    resp = await client.post("/api/runs", json={"task": task})
    run_id = resp.json()["id"]

    state = await wait_for_status(client, run_id, {"WAITING_FOR_APPROVAL"})
    assert state["status"] == "WAITING_FOR_APPROVAL"

    trace = (await client.get(f"/api/runs/{run_id}/trace")).json()
    approval_required = [e for e in trace if e["type"] == "APPROVAL_REQUIRED"]
    assert len(approval_required) == 1
    assert approval_required[0]["name"] == "send_email"
