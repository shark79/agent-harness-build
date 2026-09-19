import type {
  EvaluationResult,
  RunCreateResponse,
  RunDetail,
  RunListItem,
  TraceEvent,
} from "./types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new ApiError(res.status, await res.text().catch(() => res.statusText));
  }
  return res.json() as Promise<T>;
}

export function createRun(task: string): Promise<RunCreateResponse> {
  return request("/api/runs", { method: "POST", body: JSON.stringify({ task }) });
}

export function getRun(runId: string): Promise<RunDetail> {
  return request(`/api/runs/${runId}`);
}

export function getTrace(runId: string): Promise<TraceEvent[]> {
  return request(`/api/runs/${runId}/trace`);
}

export function listRuns(): Promise<RunListItem[]> {
  return request("/api/runs");
}

export function resolveApproval(
  runId: string,
  approvalId: string,
  decision: "approve" | "deny",
): Promise<unknown> {
  return request(`/api/runs/${runId}/approvals/${approvalId}`, {
    method: "POST",
    body: JSON.stringify({ decision }),
  });
}

// The evaluator lands in a later backend phase; today this 404s. Callers get
// `null` for "not available" instead of a thrown error so the UI can render
// a calm empty state rather than an error banner.
export async function evaluateRun(runId: string): Promise<EvaluationResult | null> {
  const res = await fetch(`${API_BASE}/api/runs/${runId}/evaluate`, {
    method: "POST",
    cache: "no-store",
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new ApiError(res.status, await res.text().catch(() => res.statusText));
  return res.json() as Promise<EvaluationResult>;
}

// Finds the most recent APPROVAL_REQUIRED event that has no matching
// APPROVAL_GRANTED/APPROVAL_DENIED after it, keyed by metadata.approval_id.
export function findPendingApproval(trace: TraceEvent[]): TraceEvent | null {
  let pending: TraceEvent | null = null;
  for (const evt of trace) {
    const approvalId = evt.metadata?.approval_id;
    if (evt.type === "APPROVAL_REQUIRED" && approvalId) {
      pending = evt;
    } else if (
      (evt.type === "APPROVAL_GRANTED" || evt.type === "APPROVAL_DENIED") &&
      pending?.metadata?.approval_id === approvalId
    ) {
      pending = null;
    }
  }
  return pending;
}

// Streams trace events for a run: prefers the SSE endpoint, falls back to
// polling GET /trace every second if SSE is unavailable or drops. The
// backend may not have /events yet (or a build might remove it) -- either
// way this keeps working. Returns an unsubscribe function.
export function subscribeToTrace(
  runId: string,
  onEvents: (events: TraceEvent[]) => void,
): () => void {
  let stopped = false;
  let pollTimer: ReturnType<typeof setInterval> | null = null;

  function startPolling() {
    if (pollTimer || stopped) return;
    const poll = () => {
      getTrace(runId)
        .then(onEvents)
        .catch(() => {
          /* transient network error - next tick will retry */
        });
    };
    poll();
    pollTimer = setInterval(poll, 1000);
  }

  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  if (typeof window !== "undefined" && "EventSource" in window) {
    const source = new EventSource(`${API_BASE}/api/runs/${runId}/events`);
    const events: TraceEvent[] = [];
    source.onmessage = (message) => {
      try {
        events.push(JSON.parse(message.data));
        onEvents([...events]);
      } catch {
        /* ignore malformed frame */
      }
    };
    source.onerror = () => {
      source.close();
      startPolling();
    };
    return () => {
      stopped = true;
      source.close();
      stopPolling();
    };
  }

  startPolling();
  return () => {
    stopped = true;
    stopPolling();
  };
}
