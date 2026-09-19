"""THE most important test - drives a full run end-to-end against the
DemoAgentAdapter (no real OpenAI key needed) and asserts on persisted state
at each stage, not just the final result:

run created -> web_search requested -> ALLOWED -> executes ->
send_email requested -> REQUIRE_APPROVAL -> WAITING_FOR_APPROVAL, email NOT
sent yet -> approve -> resumes -> email executes (demo-sent) -> COMPLETED.
"""
from tests.conftest import wait_for_status

TASK = "Research AI agent observability and email me a summary"


async def test_golden_path_research_and_email(client):
    # 1. run created
    create_resp = await client.post("/api/runs", json={"task": TASK})
    assert create_resp.status_code == 201
    body = create_resp.json()
    run_id = body["id"]
    assert body["status"] == "CREATED"

    # 2. web_search requested, allowed, executes -> eventually pauses for
    #    the send_email approval.
    state = await wait_for_status(client, run_id, {"WAITING_FOR_APPROVAL"})
    assert state["status"] == "WAITING_FOR_APPROVAL"
    assert state["task"] == TASK

    trace = (await client.get(f"/api/runs/{run_id}/trace")).json()
    types_in_order = [e["type"] for e in trace]

    assert "TOOL_REQUESTED" in types_in_order
    search_requested = next(e for e in trace if e["type"] == "TOOL_REQUESTED" and e["name"] == "web_search")
    assert search_requested is not None

    search_permission = [
        e for e in trace if e["type"] == "PERMISSION_CHECK" and e["name"] == "web_search"
    ]
    assert search_permission and search_permission[0]["metadata"]["decision"] == "ALLOW"

    search_completed = [e for e in trace if e["type"] == "TOOL_COMPLETED" and e["name"] == "web_search"]
    assert len(search_completed) == 1

    email_requested = [e for e in trace if e["type"] == "TOOL_REQUESTED" and e["name"] == "send_email"]
    assert len(email_requested) == 1

    email_permission = [e for e in trace if e["type"] == "PERMISSION_CHECK" and e["name"] == "send_email"]
    assert email_permission[0]["metadata"]["decision"] == "REQUIRE_APPROVAL"

    approval_required = [e for e in trace if e["type"] == "APPROVAL_REQUIRED"]
    assert len(approval_required) == 1
    approval_id = approval_required[0]["metadata"]["approval_id"]

    # 3. email has NOT been sent yet
    assert not any(e["type"] == "TOOL_COMPLETED" and e["name"] == "send_email" for e in trace)

    # 4. approve
    resolve_resp = await client.post(f"/api/runs/{run_id}/approvals/{approval_id}", json={"decision": "approve"})
    assert resolve_resp.status_code == 200

    # 5. run resumes, email executes (logged as demo-sent), run COMPLETED
    final_state = await wait_for_status(client, run_id, {"COMPLETED", "FAILED"})
    assert final_state["status"] == "COMPLETED"
    assert final_state["result"] is not None
    assert final_state["tool_calls"] == 2  # web_search + send_email
    assert final_state["tokens"] > 0

    final_trace = (await client.get(f"/api/runs/{run_id}/trace")).json()
    final_types = [e["type"] for e in final_trace]

    assert "APPROVAL_GRANTED" in final_types
    email_completed = [e for e in final_trace if e["type"] == "TOOL_COMPLETED" and e["name"] == "send_email"]
    assert len(email_completed) == 1
    assert email_completed[0]["metadata"]["result"]["status"] == "sent"
    assert email_completed[0]["metadata"]["result"]["mode"] == "demo"

    assert "RUN_COMPLETED" in final_types
    assert final_types[-1] == "RUN_COMPLETED"
