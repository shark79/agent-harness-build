// Shapes mirror the FastAPI backend's pydantic schemas (backend/app/schemas/*).
// `status` and `type` are kept as `string` rather than a closed union: the
// backend adds new run statuses / trace event types across later phases
// (RETRYING, BUDGET_EXCEEDED, RETRY_STARTED, ...) and the UI must render
// whatever it's given, not crash on a value the union doesn't list yet.

export interface RunDetail {
  id: string;
  task: string;
  status: string;
  model: string | null;
  started_at: string | null;
  completed_at: string | null;
  tokens: number;
  estimated_cost: number | null;
  latency_ms: number | null;
  tool_calls: number;
  retry_count: number | null;
  result: string | null;
}

export interface RunListItem {
  id: string;
  task: string;
  status: string;
  created_at: string;
}

export interface RunCreateResponse {
  id: string;
  status: string;
}

export interface TraceEvent {
  id: string;
  run_id: string;
  type: string;
  timestamp: string;
  name: string | null;
  status: string | null;
  metadata: Record<string, unknown>;
  latency_ms: number | null;
}

export type EvaluationVerdict = "PASS" | "FAIL" | "NOT_APPLICABLE";

export interface EvaluationResult {
  tool_selection: EvaluationVerdict;
  policy_compliance: EvaluationVerdict;
  approval_compliance: EvaluationVerdict;
  budget_compliance: EvaluationVerdict;
  error_recovery: EvaluationVerdict;
  overall_score: number;
}

export const ACTIVE_STATUSES = new Set([
  "CREATED",
  "RUNNING",
  "WAITING_FOR_APPROVAL",
  "RETRYING",
]);

export function isTerminalStatus(status: string): boolean {
  return !ACTIVE_STATUSES.has(status);
}
