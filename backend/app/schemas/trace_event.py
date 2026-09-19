from datetime import datetime

from pydantic import BaseModel, Field


class TraceEventOut(BaseModel):
    id: str
    run_id: str
    type: str
    timestamp: datetime
    name: str | None = None
    status: str | None = None
    metadata: dict = Field(default_factory=dict)
    latency_ms: int | None = None
