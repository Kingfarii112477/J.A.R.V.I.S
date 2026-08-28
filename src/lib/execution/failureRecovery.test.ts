import { describe, it, expect } from "vitest";
import { classifyFailure, decideRecoveryAction } from "./failureRecovery";

describe("classifyFailure", () => {
  it("classifies a ReasoningEngine timeout stop reason as TIMEOUT", () => {
    expect(classifyFailure("timeout")).toBe("TIMEOUT");
  });

  it("classifies a network-shaped error message as NETWORK", () => {
    expect(classifyFailure("error", "network error contacting the AI provider")).toBe("NETWORK");
  });

  it("classifies a permission-shaped error message as PERMISSION", () => {
    expect(classifyFailure("error", "not authorized to perform this action")).toBe("PERMISSION");
  });

  it("classifies an invalid-parameters error as VALIDATION", () => {
    expect(classifyFailure("error", "Invalid parameters for memory_search: validation failed")).toBe("VALIDATION");
  });

  it("classifies a tool-specific timeout as TIMEOUT (retriable), not a permanent tool failure", () => {
    expect(classifyFailure("error", 'Tool "n8n_workflow" timed out.')).toBe("TIMEOUT");
  });

  it("classifies an unknown-tool error as TOOL (permanent — retrying can't help)", () => {
    expect(classifyFailure("error", 'Unknown tool "made_up_tool".')).toBe("TOOL");
  });

  it("classifies a secret-shaped-content refusal as SECURITY", () => {
    expect(classifyFailure("error", "blocked: content looked like a credential")).toBe("SECURITY");
  });

  it("falls back to MODEL for an unrecognized error message", () => {
    expect(classifyFailure("error", "the model returned something unexpected")).toBe("MODEL");
  });

  it("falls back to UNKNOWN for a non-error stop reason", () => {
    expect(classifyFailure("aborted")).toBe("UNKNOWN");
  });
});

describe("decideRecoveryAction", () => {
  it("retries TRANSIENT/NETWORK/TIMEOUT failures while under budget", () => {
    expect(decideRecoveryAction("NETWORK", 0, 2)).toBe("RETRY");
    expect(decideRecoveryAction("TIMEOUT", 1, 2)).toBe("RETRY");
  });

  it("fails permanently once the retry budget is exhausted", () => {
    expect(decideRecoveryAction("NETWORK", 2, 2)).toBe("FAIL");
  });

  it("pauses for approval on a permission or security failure", () => {
    expect(decideRecoveryAction("PERMISSION", 0, 2)).toBe("PAUSE_FOR_APPROVAL");
    expect(decideRecoveryAction("SECURITY", 0, 2)).toBe("PAUSE_FOR_APPROVAL");
  });

  it("never retries a validation/tool/model/dependency/unknown failure — fails permanently", () => {
    for (const category of ["VALIDATION", "TOOL", "MODEL", "DEPENDENCY", "UNKNOWN"] as const) {
      expect(decideRecoveryAction(category, 0, 2)).toBe("FAIL");
    }
  });
});
