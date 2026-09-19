"""In-process pub/sub for streaming TraceEvents over SSE, keyed by run_id.

Single-process hackathon demo - no Redis/external broker. If this ever needs
to run across multiple worker processes, swap this for a real broker without
touching callers (TraceRecorder.record() / the SSE route are the only two
things that touch this module).
"""
import asyncio
from collections import defaultdict


class RunEventBus:
    def __init__(self) -> None:
        self._queues: dict[str, list[asyncio.Queue]] = defaultdict(list)

    def subscribe(self, run_id: str) -> asyncio.Queue:
        queue: asyncio.Queue = asyncio.Queue()
        self._queues[run_id].append(queue)
        return queue

    def unsubscribe(self, run_id: str, queue: asyncio.Queue) -> None:
        queues = self._queues.get(run_id)
        if not queues:
            return
        if queue in queues:
            queues.remove(queue)
        if not queues:
            self._queues.pop(run_id, None)

    async def publish(self, run_id: str, event: dict) -> None:
        for queue in list(self._queues.get(run_id, [])):
            await queue.put(event)


event_bus = RunEventBus()
