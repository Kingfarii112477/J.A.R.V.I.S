import { describe, it, expect } from "vitest";
import { attemptReplan } from "./replanner";
import { DEFAULT_MISSION_BUDGET } from "./planTypes";
import { DEFAULT_AUTONOMY_LEVEL } from "@/lib/autonomy/autonomyLevels";
import { createMissionTask } from "@/lib/tasks/taskManager";
import { taskManager } from "@/lib/tasks/taskManager";
import type { Mission } from "./planTypes";

function mission(tasks: Mission["tasks"]): Mission {
  const now = Date.now();
  return {
    id: "m1",
    sessionId: "s1",
    objective: "test",
    status: "RUNNING",
    tasks,
    autonomyLevel: DEFAULT_AUTONOMY_LEVEL,
    budget: DEFAULT_MISSION_BUDGET,
    planSource: "heuristic",
    createdAt: now,
    updatedAt: now,
    startedAt: now,
    completedAt: null,
    estimatedSteps: tasks.length,
    completedSteps: 0,
    failureCount: 0,
    modelCallCount: 0,
    toolCallCount: 0,
    retryCount: 0,
  };
}

describe("attemptReplan", () => {
  it("does nothing when nothing depended on the failed task", () => {
    const a = taskManager.markFailed(createMissionTask({ missionId: "m1", title: "A", description: "", agent: "orchestrator", tools: [], dependencies: [], input: "" }), "boom");
    const result = attemptReplan(mission([a]), a.id);
    expect(result.replanned).toBe(false);
  });

  it("drops the dependency edge for tasks that depended on the failed one", () => {
    const a = taskManager.markFailed(createMissionTask({ missionId: "m1", title: "A", description: "", agent: "orchestrator", tools: [], dependencies: [], input: "" }), "boom");
    const b = createMissionTask({ missionId: "m1", title: "B", description: "", agent: "orchestrator", tools: [], dependencies: [a.id], input: "synthesize" });
    const result = attemptReplan(mission([a, b]), a.id);
    expect(result.replanned).toBe(true);
    const revisedB = result.mission.tasks.find((t) => t.id === b.id)!;
    expect(revisedB.dependencies).toEqual([]);
    expect(revisedB.input).toContain("failed and was skipped");
  });

  it("returns unreplanned for a task that isn't actually FAILED", () => {
    const a = createMissionTask({ missionId: "m1", title: "A", description: "", agent: "orchestrator", tools: [], dependencies: [], input: "" });
    const result = attemptReplan(mission([a]), a.id);
    expect(result.replanned).toBe(false);
  });

  it("returns unreplanned for an unknown task id", () => {
    const result = attemptReplan(mission([]), "ghost");
    expect(result.replanned).toBe(false);
  });
});
