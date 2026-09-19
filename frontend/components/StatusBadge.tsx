type Tone = "blue" | "amber" | "teal" | "red" | "muted";

const STATUS_MAP: Record<string, { label: string; tone: Tone; pulse?: boolean }> = {
  CREATED: { label: "Created", tone: "muted" },
  RUNNING: { label: "Running", tone: "blue", pulse: true },
  WAITING_FOR_APPROVAL: { label: "Waiting for approval", tone: "amber", pulse: true },
  WAITING_FOR_INPUT: { label: "Continue in TrueForge", tone: "amber" },
  RETRYING: { label: "Retrying", tone: "amber", pulse: true },
  COMPLETED: { label: "Completed", tone: "teal" },
  FAILED: { label: "Failed", tone: "red" },
  DENIED: { label: "Denied", tone: "red" },
  BUDGET_EXCEEDED: { label: "Budget exceeded", tone: "red" },
};

// Falls back to a neutral badge showing the raw status for any value the
// backend adds later that this UI doesn't recognize yet.
export function StatusBadge({ status }: { status: string }) {
  const info = STATUS_MAP[status] ?? { label: status, tone: "muted" as Tone };
  return (
    <span className={`status-badge tone-${info.tone}${info.pulse ? " pulse" : ""}`}>
      <span className="dot" aria-hidden />
      {info.label}
    </span>
  );
}
