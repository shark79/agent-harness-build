"""TraceRecorder - appends a TraceEvent row for every meaningful harness
action and publishes it to the per-run event bus for SSE subscribers.
"""
from datetime import datetime, timezone
from typing import Any

from app.models.trace_event import TraceEvent, TraceEventType
from app.services.events import RunEventBus


def serialize_trace_event(event: TraceEvent) -> dict:
    return {
        "id": event.id,
        "run_id": event.run_id,
        "type": event.type,
        "timestamp": event.timestamp.isoformat(),
        "name": event.name,
        "status": event.status,
        "metadata": event.event_metadata or {},
        "latency_ms": event.latency_ms,
    }


class TraceRecorder:
    def __init__(self, session_factory, event_bus: RunEventBus) -> None:
        self._session_factory = session_factory
        self._event_bus = event_bus

    async def record(
        self,
        run_id: str,
        event_type: TraceEventType,
        *,
        name: str | None = None,
        status: str | None = None,
        metadata: dict[str, Any] | None = None,
        latency_ms: int | None = None,
    ) -> dict:
        event = TraceEvent(
            run_id=run_id,
            type=event_type.value,
            timestamp=datetime.now(timezone.utc),
            name=name,
            status=status,
            event_metadata=metadata or {},
            latency_ms=latency_ms,
        )
        async with self._session_factory() as session:
            session.add(event)
            await session.commit()
            await session.refresh(event)
        payload = serialize_trace_event(event)
        await self._event_bus.publish(run_id, payload)
        return payload
