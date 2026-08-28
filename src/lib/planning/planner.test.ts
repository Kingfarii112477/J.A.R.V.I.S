import { describe, it, expect } from "vitest";
import { createHeuristicPlan } from "./planner";
import { validatePlan } from "./planValidator";
import { detectCycle } from "./taskGraph";

describe("createHeuristicPlan", () => {
  it("produces a single task for an objective matching no stage signal", () => {
    const mission = createHeuristicPlan("hello there", "s1");
    expect(mission.tasks).toHaveLength(1);
    expect(mission.tasks[0].agent).toBe("orchestrator");
  });

  it("decomposes a multi-stage objective into stage tasks plus a synthesis task", () => {
    const mission = createHeuristicPlan("Research the best AI tools and remember the findings", "s1");
    const agents = mission.tasks.map((t) => t.agent);
    expect(agents).toContain("research");
    expect(agents).toContain("memory");
    // A synthesis task appears only when there's more than one stage task.
    expect(mission.tasks.at(-1)!.agent).toBe("orchestrator");
    expect(mission.tasks.at(-1)!.dependencies.length).toBeGreaterThan(0);
  });

  it("never assigns a task a tool outside its agent's allowlist", () => {
    const mission = createHeuristicPlan("Research and analyze and automate and remember", "s1");
    for (const task of mission.tasks) {
      const result = validatePlan(mission);
      expect(result.valid).toBe(true);
      void task;
    }
  });

  it("always produces a plan with no dependency cycles", () => {
    const mission = createHeuristicPlan("Research, analyze, automate, and remember everything", "s1");
    expect(detectCycle(mission.tasks)).toEqual([]);
  });

  it("marks every produced plan's source as heuristic (never falsely claims llm)", () => {
    const mission = createHeuristicPlan("anything", "s1");
    expect(mission.planSource).toBe("heuristic");
  });

  it("starts every mission in DRAFT status, never auto-running", () => {
    const mission = createHeuristicPlan("Research something", "s1");
    expect(mission.status).toBe("DRAFT");
  });
});
