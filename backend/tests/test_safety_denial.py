"""SAFETY/POLICY TEST: a task that maps to a DENY-permission tool
(delete_record) must never execute it, and the run still finishes gracefully
instead of getting stuck or crashing.

TOOL_REQUESTED -> PERMISSION_CHECK(DENY) -> tool never executes -> agent
finishes gracefully.
"""
from app.demo.scenarios import FORBIDDEN_TOOL_TASK
from tests.conftest import wait_for_status


async def test_forbidden_tool_is_denied_and_run_finishes_gracefully(client):
    resp = await client.post("/api/runs", json={"task": FORBIDDEN_TOOL_TASK})
    assert resp.status_code == 201
    run_id = resp.json()["id"]

    state = await wait_for_status(client, run_id, {"COMPLETED", "FAILED"})
    assert state["status"] == "COMPLETED"
    assert state["result"] is not None

    trace = (await client.get(f"/api/runs/{run_id}/trace")).json()
    types = [e["type"] for e in trace]

    requested = next(e for e in trace if e["type"] == "TOOL_REQUESTED" and e["name"] == "delete_record")
    assert requested is not None

    permission_check = next(e for e in trace if e["type"] == "PERMISSION_CHECK" and e["name"] == "delete_record")
    assert permission_check["status"] == "DENY"
    assert permission_check["metadata"]["decision"] == "DENY"

    # the denied tool never actually executes
    assert not any(
        e["name"] == "delete_record" and e["type"] in ("TOOL_STARTED", "TOOL_COMPLETED") for e in trace
    )

    assert types.index("TOOL_REQUESTED") < types.index("PERMISSION_CHECK")
    assert types[-1] == "RUN_COMPLETED"
