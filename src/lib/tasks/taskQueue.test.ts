import { describe, it, expect } from "vitest";
import { nextBatch } from "./taskQueue";
import { createMissionTask, taskManager } from "./taskManager";

describe("nextBatch", () => {
  it("returns every independent ready task up to the concurrency cap", () => {
    const tasks = [
      createMissionTask({ missionId: "m1", title: "A", description: "", agent: "orchestrator", tools: [], dependencies: [], input: "" }),
      createMissionTask({ missionId: "m1", title: "B", description: "", agent: "orchestrator", tools: [], dependencies: [], input: "" }),
      createMissionTask({ missionId: "m1", title: "C", description: "", agent: "orchestrator", tools: [], dependencies: [], input: "" }),
    ];
    expect(nextBatch(tasks, 3)).toHaveLength(3);
  });

  it("caps the batch at the given concurrency limit", () => {
    const tasks = Array.from({ length: 5 }, (_, i) => createMissionTask({ missionId: "m1", title: `T${i}`, description: "", agent: "orchestrator", tools: [], dependencies: [], input: "" }));
    expect(nextBatch(tasks, 2)).toHaveLength(2);
  });

  it("excludes a task whose dependency hasn't completed", () => {
    const a = taskManager.markRunning(createMissionTask({ missionId: "m1", title: "A", description: "", agent: "orchestrator", tools: [], dependencies: [], input: "" }));
    const b = createMissionTask({ missionId: "m1", title: "B", description: "", agent: "orchestrator", tools: [], dependencies: [a.id], input: "" });
    expect(nextBatch([a, b])).toEqual([]);
  });
});
