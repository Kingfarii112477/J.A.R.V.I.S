import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./coordinator", () => ({ executeMissionTask: vi.fn() }));
vi.mock("./missionMemory", () => ({ storeMissionMemory: vi.fn().mockResolvedValue(undefined) }));

import { runExecutionLoop, type MissionControlFlags } from "./executionLoop";
import { executeMissionTask } from "./coordinator";
import { createMissionTask } from "@/lib/tasks/taskManager";
import { DEFAULT_MISSION_BUDGET } from "@/lib/planning/planTypes";
import { DEFAULT_AUTONOMY_LEVEL } from "@/lib/autonomy/autonomyLevels";
import type { Mission } from "@/lib/planning/planTypes";
import type { MissionExecutionContext } from "@/lib/execution/executionContext";
import { eventBus } from "@/lib/events/bus";

const mockExecute = vi.mocked(executeMissionTask);

function mission(tasks: Mission["tasks"], budgetOverrides: Partial<Mission["budget"]> = {}): Mission {
  const now = Date.now();
  return {
    id: "m1",
    sessionId: "s1",
    objective: "test",
    status: "RUNNING",
    tasks,
    autonomyLevel: DEFAULT_AUTONOMY_LEVEL,
    budget: { ...DEFAULT_MISSION_BUDGET, ...budgetOverrides },
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

function ctx(overrides: Partial<MissionExecutionContext> = {}): MissionExecutionContext {
  return { toolCtx: { sessionId: "s1", source: "chat" }, autonomyLevel: 2, missionAuthorized: true, ...overrides };
}

function freshFlags(): MissionControlFlags {
  return { paused: false, cancelled: false };
}

function task(id: string, overrides: Partial<Mission["tasks"][number]> = {}) {
  return { ...createMissionTask({ missionId: "m1", title: id, description: "", agent: "orchestrator", tools: [], dependencies: [], input: id }), id, ...overrides };
}

beforeEach(() => {
  mockExecute.mockReset();
});

describe("runExecutionLoop", () => {
  it("completes a successful single-task mission", async () => {
    const t = task("a");
    mockExecute.mockResolvedValue({ ok: true, taskId: t.id, output: "done", toolCallCount: 1, iterations: 1, latencyMs: 10 });
    const m = mission([t]);
    await runExecutionLoop(m, ctx(), freshFlags());
    expect(m.status).toBe("COMPLETED");
    expect(m.synthesis).toBe("done");
    expect(m.completedSteps).toBe(1);
  });

  it("updates completedSteps live as each task finishes, not only once the whole mission ends", async () => {
    const a = task("a");
    const b = task("b", { dependencies: [a.id] });
    const seenAfterFirstTask: number[] = [];
    mockExecute.mockImplementation(async (m: Mission, t) => {
      // Snapshot completedSteps as it stood going into this task's own
      // execution — for task b (the second task), a should already be
      // reflected as complete if the counter is being kept live.
      if (t.id === "b") seenAfterFirstTask.push(m.completedSteps);
      return { ok: true, taskId: t.id, output: "ok", toolCallCount: 0, iterations: 1, latencyMs: 1 };
    });
    const m = mission([a, b]);
    await runExecutionLoop(m, ctx(), freshFlags());
    expect(seenAfterFirstTask).toEqual([1]);
    expect(m.completedSteps).toBe(2);
  });

  it("runs a multi-step sequential mission in dependency order", async () => {
    const order: string[] = [];
    const a = task("a");
    const b = task("b", { dependencies: [a.id] });
    mockExecute.mockImplementation(async (_mission, t) => {
      order.push(t.id);
      return { ok: true, taskId: t.id, output: `${t.id}-out`, toolCallCount: 0, iterations: 1, latencyMs: 1 };
    });
    const m = mission([a, b]);
    await runExecutionLoop(m, ctx(), freshFlags());
    expect(order).toEqual([a.id, b.id]);
    expect(m.status).toBe("COMPLETED");
    expect(m.synthesis).toBe(`${b.id}-out`);
  });

  it("executes independent tasks in parallel, not sequentially", async () => {
    const a = task("a");
    const b = task("b");
    const timeline: string[] = [];
    mockExecute.mockImplementation(async (_mission, t) => {
      timeline.push(`${t.id}:start`);
      await new Promise((r) => setTimeout(r, t.id === "a" ? 40 : 0));
      timeline.push(`${t.id}:end`);
      return { ok: true, taskId: t.id, output: "ok", toolCallCount: 0, iterations: 1, latencyMs: 1 };
    });
    const start = Date.now();
    await runExecutionLoop(mission([a, b]), ctx(), freshFlags());
    const elapsed = Date.now() - start;
    expect(timeline.indexOf("a:start")).toBeLessThan(timeline.indexOf("a:end"));
    expect(timeline.indexOf("b:start")).toBeLessThan(timeline.indexOf("a:end"));
    expect(elapsed).toBeLessThan(80);
  });

  it("replans around a permanently failed task — its dependent still runs (annotated), not blocked", async () => {
    // attemptReplan's deliberate strategy (replanner.ts): when a task fails
    // permanently, the dependency edge onto it is dropped from dependents
    // (with an input annotation) so they can still run, rather than
    // cascading into BLOCKED. BLOCKED is reserved for a mission that never
    // gets a chance to replan (e.g. cancellation).
    const a = task("a");
    const b = task("b", { dependencies: [a.id] });
    const c = task("c"); // independent
    mockExecute.mockImplementation(async (_mission, t) => {
      if (t.id === "a") return { ok: false, taskId: t.id, error: "permanent", failureCategory: "MODEL", toolCallCount: 0, iterations: 1, latencyMs: 1 };
      return { ok: true, taskId: t.id, output: `${t.id}-out`, toolCallCount: 0, iterations: 1, latencyMs: 1 };
    });
    const m = mission([a, b, c]);
    await runExecutionLoop(m, ctx(), freshFlags());
    expect(m.tasks.find((t) => t.id === "a")!.status).toBe("FAILED");
    expect(m.tasks.find((t) => t.id === "b")!.status).toBe("COMPLETED");
    expect(m.tasks.find((t) => t.id === "b")!.input).toContain("failed and was skipped");
    expect(m.tasks.find((t) => t.id === "c")!.status).toBe("COMPLETED");
    expect(m.status).toBe("COMPLETED");
    expect(m.failureCount).toBe(1);
  });

  it("fails the mission when its only task fails permanently and nothing depends on it", async () => {
    const a = task("a");
    mockExecute.mockResolvedValue({ ok: false, taskId: a.id, error: "permanent", failureCategory: "MODEL", toolCallCount: 0, iterations: 1, latencyMs: 1 });
    const m = mission([a]);
    await runExecutionLoop(m, ctx(), freshFlags());
    expect(m.status).toBe("FAILED");
    expect(m.error).toBeTruthy();
  });

  it("retries a transient (NETWORK) failure and eventually succeeds", async () => {
    const a = task("a");
    let calls = 0;
    mockExecute.mockImplementation(async (_mission, t) => {
      calls += 1;
      if (calls === 1) return { ok: false, taskId: t.id, error: "network blip", failureCategory: "NETWORK", toolCallCount: 0, iterations: 1, latencyMs: 1 };
      return { ok: true, taskId: t.id, output: "recovered", toolCallCount: 0, iterations: 1, latencyMs: 1 };
    });
    const m = mission([a]);
    await runExecutionLoop(m, ctx(), freshFlags());
    expect(calls).toBe(2);
    expect(m.status).toBe("COMPLETED");
    expect(m.retryCount).toBe(1);
  });

  it("stops cleanly when cancelled, without executing further tasks", async () => {
    const a = task("a");
    const flags: MissionControlFlags = { paused: false, cancelled: true };
    const m = mission([a]);
    await runExecutionLoop(m, ctx(), flags);
    expect(m.status).toBe("CANCELLED");
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it("pauses cleanly and a fresh call resumes from where it left off (no restart)", async () => {
    const a = task("a");
    const b = task("b", { dependencies: [a.id] });
    mockExecute.mockImplementation(async (_mission, t) => ({ ok: true, taskId: t.id, output: `${t.id}-out`, toolCallCount: 0, iterations: 1, latencyMs: 1 }));

    const m = mission([a, b]);
    const pausingFlags: MissionControlFlags = { paused: false, cancelled: false };
    // Pause the flags right after the first batch executes once, by
    // flipping them from inside the mock's first call.
    let firstCallSeen = false;
    mockExecute.mockImplementation(async (_mission, t) => {
      if (!firstCallSeen) {
        firstCallSeen = true;
        pausingFlags.paused = true;
      }
      return { ok: true, taskId: t.id, output: `${t.id}-out`, toolCallCount: 0, iterations: 1, latencyMs: 1 };
    });

    await runExecutionLoop(m, ctx(), pausingFlags);
    expect(m.status).toBe("PAUSED");
    expect(m.tasks.find((t) => t.id === "a")!.status).toBe("COMPLETED");
    expect(mockExecute).toHaveBeenCalledTimes(1); // b never ran yet

    // Resume: fresh flags, same mutable mission/task state.
    await runExecutionLoop(m, ctx(), freshFlags());
    expect(m.status).toBe("COMPLETED");
    expect(mockExecute).toHaveBeenCalledTimes(2); // only b ran the second time — a was never re-executed
  });

  it("pauses when the tool-call budget is exceeded, without spinning forever", async () => {
    const a = task("a");
    mockExecute.mockResolvedValue({ ok: true, taskId: a.id, output: "ok", toolCallCount: 999, iterations: 1, latencyMs: 1 });
    const m = mission([a, task("b")], { maxToolCalls: 5 });
    await runExecutionLoop(m, ctx(), freshFlags());
    expect(m.status).toBe("PAUSED");
    expect(m.error).toMatch(/tool-call budget/i);
  });

  it("persists (onTick) before emitting mission.task.started, mission.completed, and mission.cancelled — never the reverse", async () => {
    // useMissions() and friends refetch from MissionStore the instant they
    // hear one of these events; if the event fires before onTick persists
    // the new state, that refetch reads stale data with no later event to
    // self-correct it (these are all terminal `return`s in the loop).
    const order: string[] = [];
    const offStarted = eventBus.on("mission.task.started", () => order.push("event:task.started"));
    const offCompleted = eventBus.on("mission.completed", () => order.push("event:completed"));
    mockExecute.mockResolvedValue({ ok: true, taskId: "a", output: "ok", toolCallCount: 0, iterations: 1, latencyMs: 1 });
    const onTick = () => order.push("tick");
    await runExecutionLoop(mission([task("a")]), ctx(), freshFlags(), onTick);
    offStarted();
    offCompleted();
    // tick(dispatch) -> task.started -> tick(end of iteration 1, unconditional)
    // -> tick(complete branch) -> completed. Every event is still preceded
    // by its own persist — the extra tick is a harmless additional save.
    expect(order).toEqual(["tick", "event:task.started", "tick", "tick", "event:completed"]);
  });

  it("persists (onTick) before emitting mission.cancelled", async () => {
    const order: string[] = [];
    const off = eventBus.on("mission.cancelled", () => order.push("event:cancelled"));
    const onTick = () => order.push("tick");
    await runExecutionLoop(mission([task("a")]), ctx(), { paused: false, cancelled: true }, onTick);
    off();
    expect(order).toEqual(["tick", "event:cancelled"]);
  });

  it("emits mission.completed on success and mission.failed on total failure", async () => {
    const completed: string[] = [];
    const offC = eventBus.on("mission.completed", (p) => completed.push(p.missionId));
    mockExecute.mockResolvedValue({ ok: true, taskId: "a", output: "ok", toolCallCount: 0, iterations: 1, latencyMs: 1 });
    await runExecutionLoop(mission([task("a")]), ctx(), freshFlags());
    offC();
    expect(completed).toEqual(["m1"]);
  });
});
