from datetime import datetime

from pydantic import BaseModel, Field


class RunCreate(BaseModel):
    task: str
    # Extension to the base contract: overrides DEMO_FORCE_MODEL_FAILURE for
    # this one run only, so the "Model Failure" demo scenario doesn't require
    # restarting the server with a different env var.
    force_model_failure: bool = False


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
    estimated_cost: float | None
    latency_ms: int | None = None
    tool_calls: int
    retry_count: int | None
    result: str | None = None
    provider: str = "local"
    trueforge_session_id: str | None = None
    pending_approvals: list[dict] = Field(default_factory=list)
    sync_error: str | None = None


class RunListItem(BaseModel):
    id: str
    task: str
    status: str
    created_at: datetime
