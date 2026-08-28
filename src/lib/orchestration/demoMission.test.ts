import { describe, it, expect } from "vitest";
import { createDemoMission, DEMO_MISSION_OBJECTIVE } from "./demoMission";
import { validatePlan } from "@/lib/planning/planValidator";
import { detectCycle } from "@/lib/planning/taskGraph";

describe("createDemoMission", () => {
  it("produces exactly the five named steps", () => {
    const mission = createDemoMission("s1");
    expect(mission.tasks).toHaveLength(5);
    expect(mission.tasks.map((t) => t.title)).toEqual([
      "Inspect system telemetry",
      "Analyze subsystem health",
      "Review recent diagnostic events",
      "Search memory for relevant patterns",
      "Produce optimization summary",
    ]);
  });

  it("uses the spec's exact objective", () => {
    expect(createDemoMission("s1").objective).toBe(DEMO_MISSION_OBJECTIVE);
  });

  it("starts in DRAFT — never auto-runs", () => {
    expect(createDemoMission("s1").status).toBe("DRAFT");
  });

  it("only uses SAFE, side-effect-free tools", () => {
    const mission = createDemoMission("s1");
    const allTools = mission.tasks.flatMap((t) => t.tools);
    expect(allTools.every((t) => ["system_status", "run_diagnostics", "memory_search"].includes(t))).toBe(true);
  });

  it("runs the memory search independently (in parallel) of the analysis chain", () => {
    const mission = createDemoMission("s1");
    const memoryTask = mission.tasks.find((t) => t.agent === "memory")!;
    expect(memoryTask.dependencies).toEqual([]);
  });

  it("the final synthesis task depends on every prior task", () => {
    const mission = createDemoMission("s1");
    const synthesis = mission.tasks.at(-1)!;
    const priorIds = mission.tasks.slice(0, -1).map((t) => t.id);
    expect(synthesis.dependencies.sort()).toEqual(priorIds.sort());
  });

  it("produces a valid, cycle-free plan", () => {
    const mission = createDemoMission("s1");
    expect(detectCycle(mission.tasks)).toEqual([]);
    expect(validatePlan(mission).valid).toBe(true);
  });
});
