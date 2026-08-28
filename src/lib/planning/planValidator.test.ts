import { describe, it, expect } from "vitest";
import { validatePlan } from "./planValidator";
import { DEFAULT_MISSION_BUDGET } from "./planTypes";
import { DEFAULT_AUTONOMY_LEVEL } from "@/lib/autonomy/autonomyLevels";
import { createMissionTask } from "@/lib/tasks/taskManager";
import type { Mission } from "./planTypes";

function baseMission(overrides: Partial<Mission> = {}): Mission {
  const now = Date.now();
  return {
    id: "m1",
    sessionId: "s1",
    objective: "test",
    status: "DRAFT",
    tasks: [],
    autonomyLevel: DEFAULT_AUTONOMY_LEVEL,
    budget: DEFAULT_MISSION_BUDGET,
    planSource: "heuristic",
    createdAt: now,
    updatedAt: now,
    startedAt: null,
    completedAt: null,
    estimatedSteps: 0,
    completedSteps: 0,
    failureCount: 0,
    modelCallCount: 0,
    toolCallCount: 0,
    retryCount: 0,
    ...overrides,
  };
}

describe("validatePlan", () => {
  it("rejects a plan with no tasks", () => {
    const result = validatePlan(baseMission());
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /no tasks/i.test(e))).toBe(true);
  });

  it("accepts a well-formed single-task plan with a valid agent/tool", () => {
    const t = createMissionTask({ missionId: "m1", title: "Check status", description: "", agent: "analysis", tools: ["system_status"], dependencies: [], input: "check" });
    const result = validatePlan(baseMission({ tasks: [t] }));
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("rejects a plan with a cyclic dependency", () => {
    const a = createMissionTask({ missionId: "m1", title: "A", description: "", agent: "orchestrator", tools: [], dependencies: ["b-placeholder"], input: "" });
    const b = createMissionTask({ missionId: "m1", title: "B", description: "", agent: "orchestrator", tools: [], dependencies: [a.id], input: "" });
    const withCycle = { ...a, dependencies: [b.id] };
    const result = validatePlan(baseMission({ tasks: [withCycle, b] }));
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /circular/i.test(e))).toBe(true);
  });

  it("rejects a plan referencing an unknown agent", () => {
    const t = createMissionTask({ missionId: "m1", title: "A", description: "", agent: "not-a-real-agent" as never, tools: [], dependencies: [], input: "" });
    const result = validatePlan(baseMission({ tasks: [t] }));
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /unknown agent/i.test(e))).toBe(true);
  });

  it("rejects a task requesting a tool outside its agent's allowlist", () => {
    const t = createMissionTask({ missionId: "m1", title: "A", description: "", agent: "research", tools: ["n8n_workflow"], dependencies: [], input: "" });
    const result = validatePlan(baseMission({ tasks: [t] }));
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /not permitted/i.test(e))).toBe(true);
  });

  it("rejects a plan exceeding the mission's max task budget", () => {
    const tasks = Array.from({ length: 3 }, (_, i) => createMissionTask({ missionId: "m1", title: `T${i}`, description: "", agent: "orchestrator", tools: [], dependencies: [], input: "" }));
    const result = validatePlan(baseMission({ tasks, budget: { ...DEFAULT_MISSION_BUDGET, maxTasks: 2 } }));
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /exceeding the mission budget/i.test(e))).toBe(true);
  });
});
