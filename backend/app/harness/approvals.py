"""ApprovalEngine - persists ApprovalRequest rows for tool calls that
PermissionEngine marked REQUIRE_APPROVAL, and resolves them (approve/deny).
The API layer's POST /api/runs/{id}/approvals/{approval_id} calls resolve().
"""
from datetime import datetime, timezone

from app.models.approval import ApprovalRequest, ApprovalStatus


class ApprovalEngine:
    def __init__(self, session_factory) -> None:
        self._session_factory = session_factory

    async def create(self, run_id: str, tool_name: str, tool_args: dict) -> ApprovalRequest:
        async with self._session_factory() as session:
            approval = ApprovalRequest(
                run_id=run_id,
                tool_name=tool_name,
                tool_args=tool_args,
                status=ApprovalStatus.PENDING.value,
            )
            session.add(approval)
            await session.commit()
            await session.refresh(approval)
            return approval

    async def resolve(self, approval_id: str, decision: str) -> ApprovalRequest:
        if decision not in ("approve", "deny"):
            raise ValueError(f"invalid decision: {decision!r}")
        async with self._session_factory() as session:
            approval = await session.get(ApprovalRequest, approval_id)
            if approval is None:
                raise KeyError(f"unknown approval: {approval_id}")
            if approval.status != ApprovalStatus.PENDING.value:
                raise ValueError(f"approval {approval_id} already resolved ({approval.status})")
            approval.status = ApprovalStatus.APPROVED.value if decision == "approve" else ApprovalStatus.DENIED.value
            approval.resolved_at = datetime.now(timezone.utc)
            await session.commit()
            await session.refresh(approval)
            return approval
