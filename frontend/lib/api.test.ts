import { describe, expect, test } from "vitest";
import { findPendingApproval } from "./api";
import type { TraceEvent } from "./types";

function event(partial: Partial<TraceEvent> & Pick<TraceEvent, "type">): TraceEvent {
  return {
    id: Math.random().toString(36),
    run_id: "run-1",
    timestamp: new Date().toISOString(),
    name: null,
    status: null,
    metadata: {},
    latency_ms: null,
    ...partial,
  };
}

describe("findPendingApproval", () => {
  test("returns null for an empty trace", () => {
    expect(findPendingApproval([])).toBeNull();
  });

  test("returns null when no approval has been requested", () => {
    const trace = [event({ type: "RUN_STARTED" }), event({ type: "MODEL_CALL_STARTED" })];
    expect(findPendingApproval(trace)).toBeNull();
  });

  test("returns the APPROVAL_REQUIRED event when it has no matching decision yet", () => {
    const required = event({
      type: "APPROVAL_REQUIRED",
      metadata: { approval_id: "appr-1", args: { to: "a@b.com" } },
    });
    const trace = [event({ type: "TOOL_REQUESTED" }), required];
    expect(findPendingApproval(trace)).toBe(required);
  });

  test("returns null once APPROVAL_GRANTED resolves the matching approval_id", () => {
    const trace = [
      event({ type: "APPROVAL_REQUIRED", metadata: { approval_id: "appr-1" } }),
      event({ type: "APPROVAL_GRANTED", metadata: { approval_id: "appr-1" } }),
    ];
    expect(findPendingApproval(trace)).toBeNull();
  });

  test("returns null once APPROVAL_DENIED resolves the matching approval_id", () => {
    const trace = [
      event({ type: "APPROVAL_REQUIRED", metadata: { approval_id: "appr-1" } }),
      event({ type: "APPROVAL_DENIED", metadata: { approval_id: "appr-1" } }),
    ];
    expect(findPendingApproval(trace)).toBeNull();
  });

  test("finds a second pending approval after an earlier one was resolved", () => {
    const secondRequired = event({
      type: "APPROVAL_REQUIRED",
      metadata: { approval_id: "appr-2" },
    });
    const trace = [
      event({ type: "APPROVAL_REQUIRED", metadata: { approval_id: "appr-1" } }),
      event({ type: "APPROVAL_GRANTED", metadata: { approval_id: "appr-1" } }),
      secondRequired,
    ];
    expect(findPendingApproval(trace)).toBe(secondRequired);
  });
});
