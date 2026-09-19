from tests.conftest import wait_for_status


async def test_send_email_request_creates_pending_approval_and_pauses_run(client):
    resp = await client.post("/api/runs", json={"task": "Research widgets and email me a summary"})
    run_id = resp.json()["id"]

    state = await wait_for_status(client, run_id, {"WAITING_FOR_APPROVAL"})
    assert state["status"] == "WAITING_FOR_APPROVAL"

    trace = (await client.get(f"/api/runs/{run_id}/trace")).json()
    approval_required = [e for e in trace if e["type"] == "APPROVAL_REQUIRED"]
    assert len(approval_required) == 1
    assert approval_required[0]["name"] == "send_email"


async def test_approving_resolves_request_and_resumes_to_completion(client):
    resp = await client.post("/api/runs", json={"task": "Research widgets and email me a summary"})
    run_id = resp.json()["id"]
    await wait_for_status(client, run_id, {"WAITING_FOR_APPROVAL"})

    trace = (await client.get(f"/api/runs/{run_id}/trace")).json()
    approval_id = next(e["metadata"]["approval_id"] for e in trace if e["type"] == "APPROVAL_REQUIRED")

    resolve_resp = await client.post(f"/api/runs/{run_id}/approvals/{approval_id}", json={"decision": "approve"})
    assert resolve_resp.status_code == 200
    assert resolve_resp.json()["decision"] == "approve"

    state = await wait_for_status(client, run_id, {"COMPLETED", "FAILED"})
    assert state["status"] == "COMPLETED"

    trace = (await client.get(f"/api/runs/{run_id}/trace")).json()
    types = [e["type"] for e in trace]
    assert "APPROVAL_GRANTED" in types
    assert "TOOL_COMPLETED" in types


async def test_denying_resolves_request_and_run_still_reaches_terminal_state(client):
    resp = await client.post("/api/runs", json={"task": "Research widgets and email me a summary"})
    run_id = resp.json()["id"]
    await wait_for_status(client, run_id, {"WAITING_FOR_APPROVAL"})

    trace = (await client.get(f"/api/runs/{run_id}/trace")).json()
    approval_id = next(e["metadata"]["approval_id"] for e in trace if e["type"] == "APPROVAL_REQUIRED")

    resolve_resp = await client.post(f"/api/runs/{run_id}/approvals/{approval_id}", json={"decision": "deny"})
    assert resolve_resp.status_code == 200
    assert resolve_resp.json()["decision"] == "deny"

    # Not stuck, not crashed - reaches a terminal state gracefully.
    state = await wait_for_status(client, run_id, {"COMPLETED", "FAILED", "DENIED"})
    assert state["status"] in {"COMPLETED", "DENIED"}

    trace = (await client.get(f"/api/runs/{run_id}/trace")).json()
    types = [e["type"] for e in trace]
    assert "APPROVAL_DENIED" in types
    # send_email must never have actually executed
    assert not any(e["type"] == "TOOL_COMPLETED" and e["name"] == "send_email" for e in trace)
