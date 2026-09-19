"""Official TrueForge SDK bridge. Execution and approval enforcement stay remote.

Uses non-streaming turn creation and persisted session-event replay. Dashboard
GET polling drives synchronization; no local task owns the remote agent's life.
See https://trueforge.dev/api/use-agent and the session-events API reference.
"""
import asyncio
import json
from datetime import datetime, timezone
from uuid import NAMESPACE_URL, uuid5

from sqlalchemy import select
from trueforge_sdk import AsyncTrueForge

from app.config import settings
from app.models.db import async_session_factory
from app.models.run import Run
from app.models.trace_event import TraceEvent
from app.models.trueforge import TrueForgeRun
from app.harness.tracing import serialize_trace_event
from app.services.events import event_bus


def _dict(value):
    return value.model_dump(mode="json", exclude_none=True) if hasattr(value, "model_dump") else value


def _id(*parts):
    return str(uuid5(NAMESPACE_URL, ":".join(parts)))


def _safe_event(event):
    """Do not copy model reasoning or OAuth URLs into the dashboard database."""
    if isinstance(event, list):
        return [_safe_event(item) for item in event]
    if not isinstance(event, dict):
        return event
    return {key: _safe_event(value) for key, value in event.items()
            if key not in {"reasoning_content", "auth_url", "access_token", "refresh_token", "api_key"}}



class TrueForgeHarnessProvider:
    def __init__(self, client=None, session_factory=async_session_factory):
        self.client = client or AsyncTrueForge(
            base_url=settings.trueforge_base_url,
            token=settings.trueforge_token or None,
            timeout=30,
        )
        self.db = session_factory
        self._locks: dict[str, asyncio.Lock] = {}

    def _lock(self, run_id):
        return self._locks.setdefault(run_id, asyncio.Lock())

    async def start_run(self, run_id: str, task: str, force_model_failure: bool = False):
        async with self._lock(run_id):
            async with self.db() as db:
                if await db.get(TrueForgeRun, run_id):
                    raise ValueError("run already has a TrueForge session submission")
                db.add(TrueForgeRun(run_id=run_id))
                await db.commit()
            try:
                if force_model_failure:
                    raise ValueError("Failure simulation is only available with HARNESS_PROVIDER=local")
                # Never automatically retry a mutation: an interrupted response may
                # have already created the remote session or started the real job.
                response = await self.client.sessions.create(
                    agent={"name": settings.trueforge_agent_name},
                    metadata={"control_tower_run_id": run_id},
                    request_options={"max_retries": 0},
                )
                async with self.db() as db:
                    link = await db.get(TrueForgeRun, run_id)
                    link.session_id = response.data.id
                    run = await db.get(Run, run_id)
                    run.status = "RUNNING"
                    run.started_at = datetime.now(timezone.utc)
                    await db.commit()
                await self._submit(run_id, [{"type": "user.message", "content": task}])
            except Exception:
                async with self.db() as db:
                    link = await db.get(TrueForgeRun, run_id)
                    run = await db.get(Run, run_id)
                    run.status = "WAITING_FOR_INPUT" if link.session_id else "FAILED"
                    run.result = (
                        "TrueForge request did not complete. Check the TrueForge session before retrying; "
                        "the remote action may already have started."
                        if link.session_id else
                        "Could not create the TrueForge session. Check server availability, saved agent name, and authentication."
                    )
                    await db.commit()

    async def _submit(self, run_id, inputs):
        async with self.db() as db:
            link = await db.get(TrueForgeRun, run_id)
            link.submission_uncertain = True
            session_id = link.session_id
            await db.commit()
        response = await self.client.sessions.create_turn(
            session_id=session_id, input=inputs, request_options={"max_retries": 0},
        )
        async with self.db() as db:
            link = await db.get(TrueForgeRun, run_id)
            link.turn_id = response.data.id
            link.pending = []
            link.submission_uncertain = False
            run = await db.get(Run, run_id)
            run.status = "RUNNING"
            run.result = None
            await db.commit()

    async def sync(self, run_id):
        async with self._lock(run_id):
            return await self._sync(run_id)

    async def _sync(self, run_id):
        async with self.db() as db:
            link = await db.get(TrueForgeRun, run_id)
            if link is None or not link.session_id:
                return
            session_id = link.session_id
            old_pending = link.pending
            old_turn_id = link.turn_id
        # The current session-events endpoint includes persisted running events.
        # Use pagination rather than assuming one response contains the trace.
        events = []
        async for item in await self.client.sessions.list_events(session_id=session_id):
            item = _dict(item)
            events.append((item["turn_id"], _safe_event(item["event"])))
        turns = [_dict(t) async for t in await self.client.sessions.list_turns(session_id=session_id)]
        if not turns:
            return
        turn = max(turns, key=lambda t: (t["created_at"], t["id"]))
        state = turn["state"]
        event_index = {e["id"]: e for _, e in events}
        pending = []
        for action in state.get("required_actions", []):
            if action["type"] != "tool.approval_required":
                continue
            for ref in action["tool_calls"]:
                message = event_index.get(ref["source_event_id"], {})
                call = next((c for c in message.get("tool_calls", []) if c["id"] == ref["id"]), None)
                if call is None:
                    # Never offer an approval without knowing the proposed action.
                    continue
                approval_id = _id(run_id, turn["id"], action["thread_id"], ref["id"])
                args = call["function"].get("arguments", "{}")
                try:
                    args = json.loads(args) if isinstance(args, str) else args
                except ValueError:
                    args = {"raw_arguments": args}
                prior = next((p for p in old_pending if p["id"] == approval_id), {})
                pending.append({
                    "id": approval_id, "thread_id": action["thread_id"], "tool_call_id": ref["id"],
                    "name": call["tool_info"]["name"], "args": args,
                    "decision": prior.get("decision"),
                })
        actions = state.get("required_actions", [])
        status = "RUNNING"
        result = None
        if state["status"] == "done":
            if actions:
                approval_count = sum(len(a.get("tool_calls", [])) for a in actions if a["type"] == "tool.approval_required")
                approvals_only = all(a["type"] == "tool.approval_required" for a in actions)
                status = "WAITING_FOR_APPROVAL" if approvals_only and len(pending) == approval_count else "WAITING_FOR_INPUT"
                result = "Complete the pending request in TrueForge." if status == "WAITING_FOR_INPUT" else None
            else:
                status = "COMPLETED"
                content = (state.get("output") or {}).get("content", "")
                result = content if isinstance(content, str) else json.dumps(content)
        elif state["status"] in {"error", "cancelled"}:
            status = "FAILED"
            result = f"TrueForge turn {state['status']}; inspect the session for details."
        published = []
        async with self.db() as db:
            link = await db.get(TrueForgeRun, run_id)
            link.turn_id = turn["id"]
            link.pending = pending
            if turn["id"] != old_turn_id:
                link.submission_uncertain = False
            if link.submission_uncertain:
                status = "WAITING_FOR_INPUT"
                result = "Turn submission was interrupted. Inspect the session in TrueForge before taking further action."
            run = await db.get(Run, run_id)
            run.status = status
            run.result = result
            run.tool_calls = sum(e["type"] == "tool.response" for _, e in events)
            run.tokens = sum(((e.get("usage") or {}).get("input_tokens", 0) or 0) + ((e.get("usage") or {}).get("output_tokens", 0) or 0) for _, e in events if e["type"] == "model.message")
            if status in {"COMPLETED", "FAILED"}:
                run.completed_at = datetime.fromisoformat(state["completed_at"].replace("Z", "+00:00"))
            for turn_id, event in sorted(events, key=lambda item: (item[1].get("created_at", ""), item[1]["id"])):
                trace_id = _id(run_id, turn_id, event["id"])
                trace = await db.get(TraceEvent, trace_id)
                metadata = {"provider": "trueforge", "turn_id": turn_id, "event": event}
                if trace is None:
                    trace = TraceEvent(id=trace_id, run_id=run_id, type="TRUEFORGE_EVENT", name=event["type"], event_metadata=metadata)
                    if event.get("created_at"):
                        trace.timestamp = datetime.fromisoformat(event["created_at"].replace("Z", "+00:00"))
                    db.add(trace)
                elif trace.event_metadata == metadata:
                    continue
                else:
                    trace.event_metadata = metadata
                await db.flush()
                published.append(serialize_trace_event(trace))
            for approval in pending:
                for suffix, kind in [("request", "APPROVAL_REQUIRED"), ("decision", "APPROVAL_GRANTED" if approval["decision"] == "approve" else "APPROVAL_DENIED")]:
                    if suffix == "decision" and not approval["decision"]:
                        continue
                    trace_id = _id(approval["id"], suffix)
                    if await db.get(TraceEvent, trace_id):
                        continue
                    trace = TraceEvent(id=trace_id, run_id=run_id, type=kind, name=approval["name"], event_metadata={"approval_id": approval["id"], "args": approval["args"], "provider": "trueforge"})
                    db.add(trace)
                    await db.flush()
                    published.append(serialize_trace_event(trace))
            await db.commit()
        for event in published:
            await event_bus.publish(run_id, event)

    async def resolve_approval(self, run_id, approval_id, decision):
        if decision not in {"approve", "deny"}:
            raise ValueError("invalid decision")
        async with self._lock(run_id):
            await self._sync(run_id)
            async with self.db() as db:
                link = await db.get(TrueForgeRun, run_id)
                run = await db.get(Run, run_id)
                if link is None:
                    raise KeyError("unknown TrueForge run")
                if link.submission_uncertain or run.status != "WAITING_FOR_APPROVAL":
                    raise ValueError("run is not ready for approval; inspect the TrueForge session")
                pending = [dict(p) for p in link.pending]
                approval = next((p for p in pending if p["id"] == approval_id), None)
                if approval is None:
                    raise KeyError("approval does not belong to this run's current turn")
                if approval["decision"]:
                    raise ValueError("approval already resolved")
                approval["decision"] = decision
                link.pending = pending
                await db.commit()
            # Multiple subagents can pause together. Collect each user's decision
            # and send a single continuation once every call has been reviewed.
            await self._sync(run_id)
            if all(p["decision"] for p in pending):
                inputs = [{"type": "user.tool_approval", "thread_id": p["thread_id"],
                           "tool_call_id": p["tool_call_id"],
                           "approval": {"status": "allow" if p["decision"] == "approve" else "deny"}}
                          for p in pending]
                await self._submit(run_id, inputs)
