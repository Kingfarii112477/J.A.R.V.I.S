import { describe, it, expect } from "vitest";
import { createMissionTask, taskManager } from "./taskManager";

function baseTask() {
  return createMissionTask({ missionId: "m1", title: "Test", description: "desc", agent: "orchestrator", tools: [], dependencies: [], input: "do it" });
}

describe("createMissionTask", () => {
  it("starts every task PENDING with zero retries", () => {
    const t = baseTask();
    expect(t.status).toBe("PENDING");
    expect(t.retryCount).toBe(0);
    expect(t.startedAt).toBeNull();
    expect(t.completedAt).toBeNull();
  });

  it("defaults priority to medium", () => {
    expect(baseTask().priority).toBe("medium");
  });
});

describe("taskManager transitions", () => {
  it("markRunning sets status and startedAt", () => {
    const t = taskManager.markRunning(baseTask());
    expect(t.status).toBe("RUNNING");
    expect(t.startedAt).not.toBeNull();
  });

  it("markCompleted sets output, toolCallCount, and completedAt", () => {
    const t = taskManager.markCompleted(baseTask(), "the result", 3);
    expect(t.status).toBe("COMPLETED");
    expect(t.output).toBe("the result");
    expect(t.toolCallCount).toBe(3);
    expect(t.completedAt).not.toBeNull();
  });

  it("markFailed records the error", () => {
    const t = taskManager.markFailed(baseTask(), "it broke");
    expect(t.status).toBe("FAILED");
    expect(t.error).toBe("it broke");
  });

  it("markBlocked records the reason", () => {
    const t = taskManager.markBlocked(baseTask(), "dependency failed");
    expect(t.status).toBe("BLOCKED");
    expect(t.error).toBe("dependency failed");
  });

  it("markCancelled sets completedAt without an error", () => {
    const t = taskManager.markCancelled(baseTask());
    expect(t.status).toBe("CANCELLED");
    expect(t.completedAt).not.toBeNull();
  });

  it("incrementRetry bumps retryCount, resets to PENDING, and clears any prior error", () => {
    const failed = taskManager.markFailed(baseTask(), "transient blip");
    const retried = taskManager.incrementRetry(failed);
    expect(retried.retryCount).toBe(1);
    expect(retried.status).toBe("PENDING");
    expect(retried.error).toBeUndefined();
  });
});
