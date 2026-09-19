import pytest

from app.config import settings
from app.harness.budget import BudgetStatus, check_budget, estimate_cost
from tests.conftest import wait_for_status


def test_check_budget_ok_below_warning_threshold():
    check = check_budget(10, 0.01, max_tokens=1000, max_cost=1.0)
    assert check.status == BudgetStatus.OK


def test_check_budget_warning_at_80_percent():
    check = check_budget(80, 0.0, max_tokens=100, max_cost=1.0)
    assert check.status == BudgetStatus.WARNING


def test_check_budget_exceeded_at_100_percent():
    check = check_budget(100, 0.0, max_tokens=100, max_cost=1.0)
    assert check.status == BudgetStatus.EXCEEDED


def test_check_budget_exceeded_via_cost_limit_alone():
    check = check_budget(0, 1.0, max_tokens=100_000, max_cost=1.0)
    assert check.status == BudgetStatus.EXCEEDED


def test_estimate_cost_is_proportional_to_tokens():
    assert estimate_cost("gpt-4o-mini", 2000) == pytest.approx(2 * 0.00015)


def test_estimate_cost_falls_back_to_default_price_for_unknown_model():
    assert estimate_cost("some-unknown-model", 1000) > 0


async def test_normal_run_updates_estimated_cost_incrementally(client):
    resp = await client.post("/api/runs", json={"task": "say hello"})
    run_id = resp.json()["id"]

    state = await wait_for_status(client, run_id, {"COMPLETED", "FAILED"})
    assert state["status"] == "COMPLETED"
    assert state["estimated_cost"] > 0


async def test_budget_warning_recorded_when_run_crosses_80_percent(client, monkeypatch):
    # DemoAgentAdapter("say hello") uses 35 total tokens (see demo_agent.py's
    # _estimate_usage): 35/40 = 0.875 -> WARNING, not EXCEEDED.
    monkeypatch.setattr(settings, "max_run_tokens", 40)
    monkeypatch.setattr(settings, "max_run_cost", 1000.0)

    resp = await client.post("/api/runs", json={"task": "say hello"})
    run_id = resp.json()["id"]

    state = await wait_for_status(client, run_id, {"COMPLETED", "FAILED", "BUDGET_EXCEEDED"})
    assert state["status"] == "COMPLETED"

    trace = (await client.get(f"/api/runs/{run_id}/trace")).json()
    types = [e["type"] for e in trace]
    assert "BUDGET_WARNING" in types
    assert "BUDGET_EXCEEDED" not in types


async def test_budget_exceeded_stops_run_gracefully(client, monkeypatch):
    monkeypatch.setattr(settings, "max_run_tokens", 1)
    monkeypatch.setattr(settings, "max_run_cost", 1000.0)

    resp = await client.post("/api/runs", json={"task": "say hello"})
    run_id = resp.json()["id"]

    state = await wait_for_status(client, run_id, {"BUDGET_EXCEEDED", "COMPLETED", "FAILED"})
    assert state["status"] == "BUDGET_EXCEEDED"
    assert state["result"] is not None
    assert "budget" in state["result"].lower()

    trace = (await client.get(f"/api/runs/{run_id}/trace")).json()
    types = [e["type"] for e in trace]
    assert "BUDGET_EXCEEDED" in types
    assert "RUN_COMPLETED" not in types
    assert "RUN_FAILED" not in types
