from datetime import datetime

from pydantic import BaseModel


class RunCreate(BaseModel):
    task: str


class RunCreateResponse(BaseModel):
    id: str
    status: str


class RunDetail(BaseModel):
    id: str
    task: str
    status: str
    model: str | None = None
    started_at: datetime | None = None
    completed_at: datetime | None = None
    tokens: int
    estimated_cost: float
    latency_ms: int | None = None
    tool_calls: int
    retry_count: int
    result: str | None = None


class RunListItem(BaseModel):
    id: str
    task: str
    status: str
    created_at: datetime
