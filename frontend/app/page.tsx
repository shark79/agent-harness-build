"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createRun, evaluateRun, findPendingApproval, getRun, listRuns, subscribeToTrace } from "@/lib/api";
import { isTerminalStatus, type EvaluationResult, type RunDetail, type RunListItem, type TraceEvent } from "@/lib/types";
import { ApprovalCard } from "@/components/ApprovalCard";
import { EvaluationPanel } from "@/components/EvaluationPanel";
import { MetricsPanel } from "@/components/MetricsPanel";
import { ResultPanel } from "@/components/ResultPanel";
import { RunHeader } from "@/components/RunHeader";
import { RunHistory } from "@/components/RunHistory";
import { StatusBadge } from "@/components/StatusBadge";
import { TaskInput } from "@/components/TaskInput";
import { TracePanel } from "@/components/TracePanel";

export default function Home() {
  const [runId, setRunId] = useState<string | null>(null);
  const [run, setRun] = useState<RunDetail | null>(null);
  const [trace, setTrace] = useState<TraceEvent[]>([]);
  const [history, setHistory] = useState<RunListItem[]>([]);
  const [evaluation, setEvaluation] = useState<EvaluationResult | null | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const evaluatedRunId = useRef<string | null>(null);

  const refreshHistory = useCallback(() => {
    listRuns()
      .then(setHistory)
      .catch(() => {});
  }, []);

  useEffect(() => {
    refreshHistory();
  }, [refreshHistory]);

  // Poll run detail every second while active, and keep the trace stream
  // (SSE-with-polling-fallback) alive in step with it. Both stop once the
  // run reaches a terminal status.
  useEffect(() => {
    if (!runId) return;
    const id = runId;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const stopTrace = subscribeToTrace(id, (events) => {
      if (!cancelled) setTrace(events);
    });

    async function tick() {
      try {
        const detail = await getRun(id);
        if (cancelled) return;
        setRun(detail);
        if (isTerminalStatus(detail.status)) {
          stopTrace();
          refreshHistory();
          return;
        }
      } catch {
        // transient network error - keep retrying on the next tick
      }
      if (!cancelled) timer = setTimeout(tick, 1000);
    }
    tick();

    return () => {
      cancelled = true;
      clearTimeout(timer);
      stopTrace();
    };
  }, [runId, refreshHistory]);

  // Evaluate once, the first time a run is observed in a terminal status.
  useEffect(() => {
    if (!run || !isTerminalStatus(run.status)) return;
    if (evaluatedRunId.current === run.id) return;
    evaluatedRunId.current = run.id;
    setEvaluation(undefined);
    evaluateRun(run.id)
      .then(setEvaluation)
      .catch(() => setEvaluation(null));
  }, [run]);

  async function handleSubmit(task: string) {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const created = await createRun(task);
      evaluatedRunId.current = null;
      setEvaluation(undefined);
      setTrace([]);
      setRun({
        id: created.id,
        task,
        status: created.status,
        model: null,
        started_at: null,
        completed_at: null,
        tokens: 0,
        estimated_cost: null,
        latency_ms: null,
        tool_calls: 0,
        retry_count: null,
        result: null,
      });
      setRunId(created.id);
    } catch {
      setSubmitError("Could not start the run. Is the backend reachable?");
    } finally {
      setSubmitting(false);
    }
  }

  function handleSelectRun(id: string) {
    evaluatedRunId.current = null;
    setEvaluation(undefined);
    setTrace([]);
    setRunId(id);
  }

  const pendingApproval = run && !isTerminalStatus(run.status) ? findPendingApproval(trace) : null;

  return (
    <div className="shell">
      <RunHeader />

      <TaskInput onSubmit={handleSubmit} disabled={submitting} />
      {submitError && <p className="form-error">{submitError}</p>}

      {run && pendingApproval && runId && (
        <ApprovalCard runId={runId} event={pendingApproval} />
      )}

      <div className="main-grid">
        <div className="main-grid-left">
          <section className="panel">
            <h2 className="panel-title">Run status</h2>
            {run ? <StatusBadge status={run.status} /> : <p className="empty-state">No run yet.</p>}
          </section>
          <MetricsPanel run={run} />
          <ResultPanel run={run} />
          {run && isTerminalStatus(run.status) && <EvaluationPanel evaluation={evaluation} />}
          <RunHistory runs={history} activeRunId={runId} onSelect={handleSelectRun} />
        </div>
        <div className="main-grid-right">
          <TracePanel events={trace} />
        </div>
      </div>
    </div>
  );
}
