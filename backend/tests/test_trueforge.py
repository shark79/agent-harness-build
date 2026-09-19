"""Integration contract tests: official SDK against an HTTP MockTransport."""
import json
import httpx
import pytest
from sqlalchemy import select
from trueforge_sdk import AsyncTrueForge
from app.harness.trueforge import TrueForgeHarnessProvider
from app.models.db import async_session_factory
from app.models.run import Run
from app.models.trace_event import TraceEvent
from app.models.trueforge import TrueForgeRun

NOW = "2026-09-19T12:00:00Z"

def event(kind, id, **kwargs):
    return {"id": id, "type": kind, "thread_id": "main", "created_at": NOW, **kwargs}

class Server:
    def __init__(self):
        self.requests, self.turns, self.events = [], [], []
        self.disconnect_post = False

    def handle(self, request):
        body = json.loads(request.content) if request.content else None
        self.requests.append((request.method, request.url.path, body))
        path = request.url.path
        if request.method == "POST" and path == "/api/v1/sessions":
            return httpx.Response(201, json={"data": {"id": "sess-1", "created_at": NOW, "updated_at": NOW,
                "created_by": "default", "title": None, "agent": {"type": "reference", "name": "research-delivery", "id": "agent-1"}}})
        if request.method == "POST" and path.endswith("/turns"):
            assert body["stream"] is False
            turn = {"id": f"turn-{len(self.turns)+1}", "session_id": "sess-1", "created_at": NOW,
                    "input": body["input"], "state": {"status": "running"}}
            self.turns.append(turn)
            if self.disconnect_post:
                raise httpx.ReadError("response lost after remote execution started")
            return httpx.Response(200, json={"data": turn})
        if request.method == "GET" and path.endswith("/events"):
            page = request.url.params.get("page_token")
            data = self.events[1:] if page else self.events[:1]
            return httpx.Response(200, json={"data": data, "pagination": {"limit": 1,
                "next_page_token": "next" if not page and len(self.events) > 1 else None}})
        if request.method == "GET" and path.endswith("/turns"):
            return httpx.Response(200, json={"data": self.turns, "pagination": {"limit": 25}})
        return httpx.Response(404, json={"error": "unknown endpoint"})

    def pause(self, count=1):
        calls = [{"id": f"call-{i}", "type": "function", "function": {"name": "send_email", "arguments": json.dumps({"to": "demo@example.invalid", "body": "brief"})},
                  "tool_info": {"type": "mcp", "name": "send_email", "server_name": "email"}} for i in range(count)]
        message = event("model.message", "msg-1", content="Draft ready", tool_calls=calls,
                        reasoning_content="private reasoning",
                        usage={"input_tokens": 10, "output_tokens": 5, "input_tokens_breakdown": {}})
        approval = event("tool.approval_required", "approval-event", tool_calls=[{"id": c["id"], "source_event_id": "msg-1"} for c in calls])
        self.events = [{"turn_id": "turn-1", "event": e} for e in [message, approval]]
        self.turns[0]["state"] = {"status": "done", "completed_at": NOW, "required_actions": [approval], "output": None}

@pytest.fixture
async def bridge():
    server = Server()
    async with httpx.AsyncClient(transport=httpx.MockTransport(server.handle)) as http:
        sdk = AsyncTrueForge(base_url="http://trueforge.test", httpx_client=http)
        yield server, TrueForgeHarnessProvider(client=sdk), sdk

async def start(provider):
    async with async_session_factory() as db:
        run = Run(task="Research and email the briefing")
        db.add(run)
        await db.commit()
        run_id = run.id
    await provider.start_run(run_id, "Research and email the briefing")
    return run_id

async def saved(run_id):
    async with async_session_factory() as db:
        return await db.get(Run, run_id), await db.get(TrueForgeRun, run_id)

async def test_real_sdk_creates_session_and_nonstreaming_turn(bridge):
    server, provider, _ = bridge
    run_id = await start(provider)
    run, link = await saved(run_id)
    assert run.status == "RUNNING"
    assert link.session_id == "sess-1" and link.turn_id == "turn-1"
    assert server.requests[0][2]["agent"] == {"name": "research-delivery"}
    assert server.turns[0]["input"][0]["type"] == "user.message"

async def test_done_with_approval_is_not_completed_and_replay_is_idempotent(bridge):
    server, provider, _ = bridge
    run_id = await start(provider)
    server.pause()
    await provider.sync(run_id)
    run, link = await saved(run_id)
    assert run.status == "WAITING_FOR_APPROVAL"
    assert run.tokens == 15
    assert link.pending[0]["args"]["body"] == "brief"
    async with async_session_factory() as db:
        before = list(await db.scalars(select(TraceEvent)))
        assert "private reasoning" not in json.dumps([t.event_metadata for t in before])
    await provider.sync(run_id)
    async with async_session_factory() as db:
        after = list(await db.scalars(select(TraceEvent)))
        assert len(after) == len(before)

@pytest.mark.parametrize("decision,wire", [("approve", "allow"), ("deny", "deny")])
async def test_approval_resumes_after_bridge_restart(bridge, decision, wire):
    server, provider, sdk = bridge
    run_id = await start(provider)
    server.pause()
    await provider.sync(run_id)
    _, link = await saved(run_id)
    await TrueForgeHarnessProvider(client=sdk).resolve_approval(run_id, link.pending[0]["id"], decision)
    assert len(server.turns) == 2
    assert server.turns[-1]["input"] == [{"type": "user.tool_approval", "thread_id": "main", "tool_call_id": "call-0", "approval": {"status": wire}}]

async def test_parallel_approvals_wait_for_all_and_submit_once(bridge):
    server, provider, _ = bridge
    run_id = await start(provider)
    server.pause(2)
    await provider.sync(run_id)
    _, link = await saved(run_id)
    a, b = link.pending
    await provider.resolve_approval(run_id, a["id"], "approve")
    assert len(server.turns) == 1
    with pytest.raises(ValueError, match="already resolved"):
        await provider.resolve_approval(run_id, a["id"], "approve")
    await provider.resolve_approval(run_id, b["id"], "deny")
    assert len(server.turns) == 2
    assert [p["approval"]["status"] for p in server.turns[-1]["input"]] == ["allow", "deny"]

async def test_wrong_approval_does_not_mutate_or_send(bridge):
    server, provider, _ = bridge
    run_id = await start(provider)
    server.pause()
    await provider.sync(run_id)
    with pytest.raises(KeyError):
        await provider.resolve_approval(run_id, "other-run-approval", "approve")
    _, link = await saved(run_id)
    assert link.pending[0]["decision"] is None
    assert len(server.turns) == 1

async def test_oauth_pause_is_not_completed_or_leaked(bridge):
    server, provider, _ = bridge
    run_id = await start(provider)
    auth = event("mcp.auth_required", "oauth", mcp_servers=[{"name": "mail", "auth_url": "https://auth.test/private"}])
    server.events = [{"turn_id": "turn-1", "event": auth}]
    server.turns[0]["state"] = {"status": "done", "completed_at": NOW, "required_actions": [auth]}
    await provider.sync(run_id)
    run, _ = await saved(run_id)
    assert run.status == "WAITING_FOR_INPUT"
    async with async_session_factory() as db:
        traces = list(await db.scalars(select(TraceEvent)))
        assert "auth.test" not in json.dumps([t.event_metadata for t in traces])

async def test_lost_post_response_does_not_retry_or_duplicate_job(bridge):
    server, provider, _ = bridge
    server.disconnect_post = True
    run_id = await start(provider)
    assert len(server.turns) == 1
    _, link = await saved(run_id)
    assert link.submission_uncertain
    await provider.sync(run_id)
    run, link = await saved(run_id)
    assert run.status == "RUNNING" and not link.submission_uncertain
    assert len(server.turns) == 1

async def test_native_continuation_and_final_output_are_restored(bridge):
    server, provider, sdk = bridge
    run_id = await start(provider)
    server.pause()
    await provider.sync(run_id)
    server.turns.append({"id": "turn-2", "session_id": "sess-1", "created_at": NOW,
        "state": {"status": "done", "completed_at": NOW, "required_actions": [],
                  "output": event("model.message", "final", content="Delivered: message-123")}})
    await TrueForgeHarnessProvider(client=sdk).sync(run_id)
    run, link = await saved(run_id)
    assert run.status == "COMPLETED" and run.result == "Delivered: message-123"
    assert link.pending == []

async def test_api_hides_offline_cost_and_refuses_fake_evaluation(bridge, client, monkeypatch):
    from app.api import runs
    server, provider, _ = bridge
    run_id = await start(provider)
    monkeypatch.setattr(runs, "harness_provider", provider)
    response = await client.get(f"/api/runs/{run_id}")
    assert response.status_code == 200
    assert response.json()["provider"] == "trueforge"
    assert response.json()["estimated_cost"] is None
    assert (await client.post(f"/api/runs/{run_id}/evaluate")).status_code == 409

async def test_session_creation_failure_stays_a_trueforge_run(client, monkeypatch):
    from app.api import runs
    def reject(request):
        return httpx.Response(401, json={"error": "unauthorized"})
    async with httpx.AsyncClient(transport=httpx.MockTransport(reject)) as http:
        provider = TrueForgeHarnessProvider(client=AsyncTrueForge(base_url="http://trueforge.test", httpx_client=http))
        run_id = await start(provider)
        monkeypatch.setattr(runs, "harness_provider", provider)
        response = (await client.get(f"/api/runs/{run_id}")).json()
        assert response["status"] == "FAILED"
        assert response["provider"] == "trueforge"
        assert (await client.post(f"/api/runs/{run_id}/evaluate")).status_code == 409

async def test_missing_tool_arguments_cannot_be_approved(bridge):
    server, provider, _ = bridge
    run_id = await start(provider)
    server.pause()
    server.events = server.events[1:]  # missing the source model message
    await provider.sync(run_id)
    run, link = await saved(run_id)
    assert run.status == "WAITING_FOR_INPUT" and link.pending == []
    with pytest.raises(ValueError, match="not ready"):
        await provider.resolve_approval(run_id, "unknown", "approve")
    assert len(server.turns) == 1

async def test_failure_simulation_is_rejected_in_trueforge_mode(client, monkeypatch):
    from app.api import runs
    monkeypatch.setattr(runs.settings, "harness_provider", "trueforge")
    response = await client.post("/api/runs", json={"task": "research", "force_model_failure": True})
    assert response.status_code == 422
