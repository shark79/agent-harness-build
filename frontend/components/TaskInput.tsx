"use client";

import { useState } from "react";

const PLACEHOLDER =
  "Research three AI developer platforms, compare their offerings, prepare an executive summary, and email it.";

const DEMOS: { label: string; task: string }[] = [
  {
    label: "Research + Email",
    task: "Research AI agent observability platforms and email me a summary.",
  },
  {
    label: "Human Approval",
    task: "Research AI agent observability and email the executive summary to the team for review.",
  },
  {
    label: "Model Failure",
    task: "Research competing agent harness vendors and email a comparison.",
  },
  {
    label: "Forbidden Tool",
    task: "Delete all records from the database.",
  },
];

export function TaskInput({
  onSubmit,
  disabled,
}: {
  onSubmit: (task: string) => void;
  disabled: boolean;
}) {
  const [task, setTask] = useState("");

  function submit(value: string) {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSubmit(trimmed);
  }

  return (
    <section className="panel task-input">
      <h2 className="panel-title">Task</h2>
      <textarea
        value={task}
        onChange={(e) => setTask(e.target.value)}
        placeholder={PLACEHOLDER}
        rows={4}
        disabled={disabled}
      />
      <div className="task-input-actions">
        <button className="run-button" disabled={disabled || !task.trim()} onClick={() => submit(task)}>
          {disabled ? "Running…" : "Run Agent"}
        </button>
      </div>
      <div className="demo-row">
        {DEMOS.map((demo) => (
          <button
            key={demo.label}
            className="demo-button"
            disabled={disabled}
            onClick={() => {
              setTask(demo.task);
              submit(demo.task);
            }}
          >
            DEMO: {demo.label}
          </button>
        ))}
      </div>
    </section>
  );
}
