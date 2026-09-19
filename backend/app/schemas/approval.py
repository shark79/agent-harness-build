from typing import Literal

from pydantic import BaseModel


class ApprovalDecisionIn(BaseModel):
    decision: Literal["approve", "deny"]
