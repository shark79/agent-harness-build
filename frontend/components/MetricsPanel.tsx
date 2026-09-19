import type { RunDetail } from "@/lib/types";

function fmt(value: number | null | undefined, suffix = ""): string {
  if (value === null || value === undefined) return "—";
  return `${value}${suffix}`;
}

function fmtCost(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return `$${value.toFixed(2)}`;
}

function fmtLatency(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return "—";
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
}

export function MetricsPanel({ run }: { run: RunDetail | null }) {
  return (
    <section className="panel">
      <h2 className="panel-title">Metrics</h2>
      <div className="metrics-grid">
        <Metric label="Model" value={run?.model ?? "—"} />
        <Metric label="Tokens" value={fmt(run?.tokens ?? null)} />
        <Metric label="Est. cost" value={fmtCost(run?.estimated_cost)} />
        <Metric label="Latency" value={fmtLatency(run?.latency_ms)} />
        <Metric label="Tool calls" value={fmt(run?.tool_calls ?? null)} />
        <Metric label="Retries" value={fmt(run?.retry_count)} />
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <span className="metric-label">{label}</span>
      <span className={`metric-value${value === "—" ? " dim" : ""}`}>{value}</span>
    </div>
  );
}
