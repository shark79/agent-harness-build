import { isTerminalStatus, type RunDetail } from "@/lib/types";

export function ResultPanel({ run }: { run: RunDetail | null }) {
  if (!run || !isTerminalStatus(run.status)) return null;

  return (
    <section className="panel">
      <h2 className="panel-title">Result</h2>
      {run.result ? (
        <p className="result-text">{run.result}</p>
      ) : (
        <p className="empty-state">The run finished with no result text.</p>
      )}
    </section>
  );
}
