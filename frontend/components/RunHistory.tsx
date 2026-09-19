import type { RunListItem } from "@/lib/types";
import { StatusBadge } from "./StatusBadge";

export function RunHistory({
  runs,
  activeRunId,
  onSelect,
}: {
  runs: RunListItem[];
  activeRunId: string | null;
  onSelect: (runId: string) => void;
}) {
  return (
    <section className="panel">
      <h2 className="panel-title">Run history</h2>
      {runs.length === 0 ? (
        <p className="empty-state">No runs yet.</p>
      ) : (
        <div className="history-list">
          {runs.map((run) => (
            <button
              key={run.id}
              className={`history-row${run.id === activeRunId ? " active" : ""}`}
              onClick={() => onSelect(run.id)}
            >
              <span className="history-task">{run.task}</span>
              <StatusBadge status={run.status} />
              <span className="history-time">
                {new Date(run.created_at).toLocaleTimeString(undefined, {
                  hour12: false,
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
