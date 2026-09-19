import type { TraceEvent as TraceEventT } from "@/lib/types";

type Tone = "blue" | "amber" | "teal" | "red" | "muted";

// Deliberately a lookup, not a switch: an event type this map doesn't have
// (a future BUDGET_WARNING, RETRY_STARTED, ...) still renders, just muted,
// instead of throwing.
const TONE_BY_TYPE: Record<string, Tone> = {
  RUN_STARTED: "blue",
  MODEL_CALL_STARTED: "blue",
  MODEL_CALL_COMPLETED: "blue",
  TOOL_REQUESTED: "muted",
  PERMISSION_CHECK: "muted",
  TOOL_STARTED: "blue",
  TOOL_COMPLETED: "teal",
  TOOL_FAILED: "red",
  APPROVAL_REQUIRED: "amber",
  APPROVAL_GRANTED: "teal",
  APPROVAL_DENIED: "red",
  RETRY_STARTED: "amber",
  FALLBACK_TRIGGERED: "amber",
  BUDGET_WARNING: "amber",
  BUDGET_EXCEEDED: "red",
  EVALUATION_STARTED: "blue",
  EVALUATION_COMPLETED: "teal",
  RUN_COMPLETED: "teal",
  RUN_FAILED: "red",
};

function formatTime(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp;
  return date.toLocaleTimeString(undefined, { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function formatType(type: string): string {
  return type.replaceAll("_", " ");
}

export function TraceEvent({ event }: { event: TraceEventT }) {
  const tone = TONE_BY_TYPE[event.type] ?? "muted";
  const hasMeta = event.metadata && Object.keys(event.metadata).length > 0;

  return (
    <div className={`trace-event tone-${tone}`}>
      <span className="node" aria-hidden />
      <div className="trace-event-head">
        <span className="trace-event-type">{formatType(event.type)}</span>
        {event.name && <span className="trace-event-name">{event.name}</span>}
        {event.status && <span className="trace-event-status">{event.status}</span>}
        <span className="trace-event-time">
          {formatTime(event.timestamp)}
          {event.latency_ms !== null ? ` · ${event.latency_ms}ms` : ""}
        </span>
      </div>
      {hasMeta && <pre className="trace-event-meta">{JSON.stringify(event.metadata, null, 2)}</pre>}
    </div>
  );
}
