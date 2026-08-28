import { describe, it, expect } from "vitest";
import { detectCycle, danglingDependencies, getReadyTasks, getNewlyBlockedTasks, isMissionComplete, hasFailedTask } from "./taskGraph";
import type { MissionTask } from "./planTypes";

function task(overrides: Partial<MissionTask> & Pick<MissionTask, "id">): MissionTask {
  return {
    missionId: "m1",
    title: overrides.id,
    description: "",
    agent: "orchestrator",
    tools: [],
    dependencies: [],
    status: "PENDING",
    priority: "medium",
    input: "",
    retryCount: 0,
    toolCallCount: 0,
    startedAt: null,
    completedAt: null,
    ...overrides,
  };
}

describe("detectCycle", () => {
  it("returns empty for a valid DAG", () => {
    const tasks = [task({ id: "a" }), task({ id: "b", dependencies: ["a"] }), task({ id: "c", dependencies: ["b"] })];
    expect(detectCycle(tasks)).toEqual([]);
  });

  it("detects a direct two-node cycle", () => {
    const tasks = [task({ id: "a", dependencies: ["b"] }), task({ id: "b", dependencies: ["a"] })];
    const cycle = detectCycle(tasks);
    expect(cycle.length).toBeGreaterThan(0);
  });

  it("detects a longer cycle", () => {
    const tasks = [task({ id: "a", dependencies: ["c"] }), task({ id: "b", dependencies: ["a"] }), task({ id: "c", dependencies: ["b"] })];
    expect(detectCycle(tasks).length).toBeGreaterThan(0);
  });

  it("ignores dangling dependency references (not a cycle)", () => {
    const tasks = [task({ id: "a", dependencies: ["missing"] })];
    expect(detectCycle(tasks)).toEqual([]);
  });
});

describe("danglingDependencies", () => {
  it("reports a dependency that doesn't reference a real task", () => {
    const tasks = [task({ id: "a", dependencies: ["ghost"] })];
    expect(danglingDependencies(tasks)).toEqual([{ taskId: "a", missingDependency: "ghost" }]);
  });

  it("reports nothing for a fully-resolved graph", () => {
    const tasks = [task({ id: "a" }), task({ id: "b", dependencies: ["a"] })];
    expect(danglingDependencies(tasks)).toEqual([]);
  });
});

describe("getReadyTasks", () => {
  it("returns independent PENDING tasks together (parallel-eligible)", () => {
    const tasks = [task({ id: "a" }), task({ id: "b" })];
    expect(getReadyTasks(tasks).map((t) => t.id).sort()).toEqual(["a", "b"]);
  });

  it("excludes a task whose dependency isn't COMPLETED yet", () => {
    const tasks = [task({ id: "a", status: "RUNNING" }), task({ id: "b", dependencies: ["a"] })];
    expect(getReadyTasks(tasks).map((t) => t.id)).toEqual([]);
  });

  it("includes a task once all its dependencies are COMPLETED", () => {
    const tasks = [task({ id: "a", status: "COMPLETED" }), task({ id: "b", dependencies: ["a"] })];
    expect(getReadyTasks(tasks).map((t) => t.id)).toEqual(["b"]);
  });

  it("never returns a task that isn't PENDING", () => {
    const tasks = [task({ id: "a", status: "RUNNING" })];
    expect(getReadyTasks(tasks)).toEqual([]);
  });
});

describe("getNewlyBlockedTasks", () => {
  it("blocks a task whose dependency FAILED", () => {
    const tasks = [task({ id: "a", status: "FAILED" }), task({ id: "b", dependencies: ["a"] })];
    expect(getNewlyBlockedTasks(tasks).map((t) => t.id)).toEqual(["b"]);
  });

  it("propagates blocking transitively", () => {
    const tasks = [task({ id: "a", status: "FAILED" }), task({ id: "b", dependencies: ["a"] }), task({ id: "c", dependencies: ["b"] })];
    expect(getNewlyBlockedTasks(tasks).map((t) => t.id).sort()).toEqual(["b", "c"]);
  });

  it("does not block a task whose dependency succeeded", () => {
    const tasks = [task({ id: "a", status: "COMPLETED" }), task({ id: "b", dependencies: ["a"] })];
    expect(getNewlyBlockedTasks(tasks)).toEqual([]);
  });
});

describe("isMissionComplete / hasFailedTask", () => {
  it("is complete when every task is terminal", () => {
    const tasks = [task({ id: "a", status: "COMPLETED" }), task({ id: "b", status: "CANCELLED" }), task({ id: "c", status: "BLOCKED" })];
    expect(isMissionComplete(tasks)).toBe(true);
  });

  it("is not complete while a task is still PENDING or RUNNING", () => {
    expect(isMissionComplete([task({ id: "a", status: "RUNNING" })])).toBe(false);
  });

  it("counts FAILED as terminal — a mission with a permanently failed task (and nothing else pending) is complete, not stalled", () => {
    const tasks = [task({ id: "a", status: "FAILED" }), task({ id: "b", status: "COMPLETED" })];
    expect(isMissionComplete(tasks)).toBe(true);
  });

  it("hasFailedTask reports a real failure", () => {
    expect(hasFailedTask([task({ id: "a", status: "FAILED" })])).toBe(true);
    expect(hasFailedTask([task({ id: "a", status: "COMPLETED" })])).toBe(false);
  });
});
