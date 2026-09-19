import asyncio
import json

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.responses import StreamingResponse

from app.harness.provider import harness_provider
from app.harness.tracing import serialize_trace_event
from app.models.db import get_session
from app.models.run import Run, RunStatus
from app.models.trace_event import TraceEvent, TraceEventType
from app.schemas.approval import ApprovalDecisionIn
from app.schemas.run import RunCreate, RunCreateResponse, RunDetail, RunListItem
from app.schemas.trace_event import TraceEventOut
from app.services.events import event_bus

router = APIRouter(prefix="/api/runs", tags=["runs"])

_TERMINAL_TRACE_TYPES = {TraceEventType.RUN_COMPLETED.value, TraceEventType.RUN_FAILED.value}


def _run_to_detail(run: Run) -> RunDetail:
    return RunDetail(
        id=run.id,
        task=run.task,
        status=run.status,
        model=run.model,
        started_at=run.started_at,
        completed_at=run.completed_at,
        tokens=run.tokens,
        estimated_cost=run.estimated_cost,
        latency_ms=run.latency_ms,
        tool_calls=run.tool_calls,
        retry_count=run.retry_count,
        result=run.result,
    )


@router.post("", response_model=RunCreateResponse, status_code=201)
async def create_run(payload: RunCreate, session: AsyncSession = Depends(get_session)) -> RunCreateResponse:
    run = Run(task=payload.task, status=RunStatus.CREATED.value)
    session.add(run)
    await session.commit()
    await session.refresh(run)

    # Kick off execution without blocking the response - see harness/orchestrator.py.
    asyncio.create_task(harness_provider.start_run(run.id, run.task))

    return RunCreateResponse(id=run.id, status=run.status)


@router.get("", response_model=list[RunListItem])
async def list_runs(session: AsyncSession = Depends(get_session), limit: int = 50) -> list[RunListItem]:
    result = await session.execute(select(Run).order_by(Run.created_at.desc()).limit(limit))
    return [
        RunListItem(id=r.id, task=r.task, status=r.status, created_at=r.created_at) for r in result.scalars().all()
    ]


@router.get("/{run_id}", response_model=RunDetail)
async def get_run(run_id: str, session: AsyncSession = Depends(get_session)) -> RunDetail:
    run = await session.get(Run, run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="run not found")
    return _run_to_detail(run)


@router.get("/{run_id}/trace", response_model=list[TraceEventOut])
async def get_trace(run_id: str, session: AsyncSession = Depends(get_session)) -> list[TraceEventOut]:
    result = await session.execute(
        select(TraceEvent).where(TraceEvent.run_id == run_id).order_by(TraceEvent.timestamp)
    )
    return [TraceEventOut(**serialize_trace_event(e)) for e in result.scalars().all()]


@router.get("/{run_id}/events")
async def stream_events(run_id: str, session: AsyncSession = Depends(get_session)) -> StreamingResponse:
    run = await session.get(Run, run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="run not found")

    result = await session.execute(
        select(TraceEvent).where(TraceEvent.run_id == run_id).order_by(TraceEvent.timestamp)
    )
    existing = [serialize_trace_event(e) for e in result.scalars().all()]

    async def event_generator():
        for event in existing:
            yield f"data: {json.dumps(event)}\n\n"
            if event["type"] in _TERMINAL_TRACE_TYPES:
                return  # run already finished - nothing more will ever be published

        queue = event_bus.subscribe(run_id)
        try:
            while True:
                event = await queue.get()
                yield f"data: {json.dumps(event)}\n\n"
                if event["type"] in _TERMINAL_TRACE_TYPES:
                    return
        finally:
            event_bus.unsubscribe(run_id, queue)

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@router.post("/{run_id}/approvals/{approval_id}")
async def resolve_approval(
    run_id: str, approval_id: str, payload: ApprovalDecisionIn, session: AsyncSession = Depends(get_session)
) -> dict:
    try:
        await harness_provider.resolve_approval(run_id, approval_id, payload.decision)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc

    run = await session.get(Run, run_id)
    return {"approval_id": approval_id, "decision": payload.decision, "run_status": run.status if run else None}
