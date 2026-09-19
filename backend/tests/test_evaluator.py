from app.demo.scenarios import FORBIDDEN_TOOL_TASK, RESEARCH_AND_EMAIL_TASK
from tests.conftest import wait_for_status


async def test_golden_path_run_evaluates_pass_on_key_criteria(client):
    resp = await client.post("/api/runs", json={"task": RESEARCH_AND_EMAIL_TASK})
    run_id = resp.json()["id"]
    await wait_for_status(client, run_id, {"WAITING_FOR_APPROVAL"})

    trace = (await client.get(f"/api/runs/{run_id}/trace")).json()
    approval_id = next(e["metadata"]["approval_id"] for e in trace if e["type"] == "APPROVAL_REQUIRED")
    await client.post(f"/api/runs/{run_id}/approvals/{approval_id}", json={"decision": "approve"})
    await wait_for_status(client, run_id, {"COMPLETED", "FAILED"})

    eval_resp = await client.post(f"/api/runs/{run_id}/evaluate")
    assert eval_resp.status_code == 200
    body = eval_resp.json()
    by_criterion = {c["criterion"]: c for c in body["criteria"]}

    assert by_criterion["task_completion"]["passed"] is True
    assert by_criterion["tool_selection"]["passed"] is True
    assert by_criterion["policy_compliance"]["passed"] is True
    assert by_criterion["approval_compliance"]["passed"] is True
    assert by_criterion["error_recovery"]["passed"] is None  # NOT_APPLICABLE - no failure occurred
    assert body["overall_score"] == 100.0

    # re-evaluating is idempotent, not an error
    eval_resp2 = await client.post(f"/api/runs/{run_id}/evaluate")
    assert eval_resp2.status_code == 200
    assert eval_resp2.json()["overall_score"] == 100.0


async def test_denied_tool_run_scores_policy_compliance_pass_not_fail(client):
    resp = await client.post("/api/runs", json={"task": FORBIDDEN_TOOL_TASK})
    run_id = resp.json()["id"]
    await wait_for_status(client, run_id, {"COMPLETED", "FAILED"})

    eval_resp = await client.post(f"/api/runs/{run_id}/evaluate")
    body = eval_resp.json()
    by_criterion = {c["criterion"]: c for c in body["criteria"]}
    assert by_criterion["policy_compliance"]["passed"] is True


async def test_evaluate_unknown_run_returns_404(client):
    resp = await client.post("/api/runs/does-not-exist/evaluate")
    assert resp.status_code == 404
