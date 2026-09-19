import type { EvaluationResult } from "@/lib/types";

const CRITERIA: { key: keyof Omit<EvaluationResult, "overall_score">; label: string }[] = [
  { key: "tool_selection", label: "Tool selection" },
  { key: "policy_compliance", label: "Policy compliance" },
  { key: "approval_compliance", label: "Approval compliance" },
  { key: "budget_compliance", label: "Budget compliance" },
  { key: "error_recovery", label: "Error recovery" },
];

// `evaluation` is undefined while the POST /evaluate call is in flight, and
// null once it has resolved to "not available" (today: always, since the
// evaluator endpoint 404s until a later backend phase ships it).
export function EvaluationPanel({ evaluation }: { evaluation: EvaluationResult | null | undefined }) {
  return (
    <section className="panel">
      <h2 className="panel-title">Evaluation</h2>
      {evaluation === undefined && <p className="empty-state">Evaluating…</p>}
      {evaluation === null && <p className="empty-state">Evaluation not yet available.</p>}
      {evaluation && (
        <>
          <div className="eval-grid">
            {CRITERIA.map((c) => (
              <div className="eval-criterion" key={c.key}>
                <span>{c.label}</span>
                <span className={`verdict ${evaluation[c.key]}`}>{evaluation[c.key]}</span>
              </div>
            ))}
          </div>
          <span className="eval-score">{evaluation.overall_score}</span>
        </>
      )}
    </section>
  );
}
