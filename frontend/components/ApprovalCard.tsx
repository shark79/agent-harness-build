"use client";

import { useState } from "react";
import { resolveApproval } from "@/lib/api";
import type { TraceEvent } from "@/lib/types";

export function ApprovalCard({
  runId,
  event,
}: {
  runId: string;
  event: TraceEvent;
}) {
  const [pendingDecision, setPendingDecision] = useState<"approve" | "deny" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const approvalId = String(event.metadata?.approval_id ?? "");
  const args = (event.metadata?.args as Record<string, unknown>) ?? {};
  const to = typeof args.to === "string" ? args.to : "—";
  const subject = typeof args.subject === "string" ? args.subject : "—";
  const preview = typeof args.body === "string" ? args.body : "—";

  async function decide(decision: "approve" | "deny") {
    if (!approvalId || pendingDecision) return;
    setPendingDecision(decision);
    setError(null);
    try {
      await resolveApproval(runId, approvalId, decision);
    } catch {
      setError("Could not record decision. Try again.");
      setPendingDecision(null);
    }
  }

  return (
    <div className="approval-banner">
      <p className="approval-banner-title">Agent wants permission to: SEND EMAIL</p>
      <dl className="approval-fields">
        <dt>To</dt>
        <dd>{to}</dd>
        <dt>Subject</dt>
        <dd>{subject}</dd>
        <dt>Preview</dt>
        <dd>{preview}</dd>
      </dl>
      <div className="approval-actions">
        <button
          className="approve-button"
          disabled={pendingDecision !== null}
          onClick={() => decide("approve")}
        >
          {pendingDecision === "approve" ? "Approving…" : "Approve"}
        </button>
        <button
          className="deny-button"
          disabled={pendingDecision !== null}
          onClick={() => decide("deny")}
        >
          {pendingDecision === "deny" ? "Denying…" : "Deny"}
        </button>
      </div>
      {error && <p className="form-error">{error}</p>}
    </div>
  );
}
