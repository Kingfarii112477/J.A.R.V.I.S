import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./executionLoop", () => ({ runExecutionLoop: vi.fn() }));

import { orchestrator } from "./orchestrator";
import { runExecutionLoop } from "./executionLoop";
import { useJarvisStore } from "@/store/jarvisStore";
import { approvalManager } from "@/lib/autonomy/approvalManager";
import type { Mission } from "@/lib/planning/planTypes";
import type { MissionControlFlags } from "./executionLoop";
import type { MissionExecutionContext } from "@/lib/execution/executionContext";

const mockRunExecutionLoop = vi.mocked(runExecutionLoop);
const toolCtx = { sessionId: "s1", source: "chat" as const };

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

beforeEach(() => {
  localStorage.clear();
  orchestrator.reset();
  mockRunExecutionLoop.mockReset();
  useJarvisStore.getState().updateSettings({ autonomyLevel: 2 });
});

describe("AutonomousOrchestrator", () => {
  it("createMission validates, persists, and starts a mission in DRAFT status", async () => {
    const mission = await orchestrator.createMission("Research the best AI tools", "s1");
    expect(mission.status).toBe("DRAFT");
    expect(mission.tasks.length).toBeGreaterThan(0);
    expect(await orchestrator.getMission(mission.id)).toEqual(mission);
    expect((await orchestrator.listMissions()).some((m) => m.id === mission.id)).toBe(true);
  });

  it("startMission runs the execution loop and returns the mutated mission on completion", async () => {
    mockRunExecutionLoop.mockImplementation(async (mission: Mission, _ctx: MissionExecutionContext, _flags: MissionControlFlags, onTick?: () => void) => {
      mission.status = "COMPLETED";
      mission.completedAt = Date.now();
      onTick?.();
    });
    const mission = await orchestrator.createMission("Research something", "s1");
    const result = await orchestrator.startMission(mission.id, toolCtx);
    expect(result?.status).toBe("COMPLETED");
    expect(mockRunExecutionLoop).toHaveBeenCalledTimes(1);
  });

  it("refuses to start a mission when autonomy is set to Manual (level 0)", async () => {
    useJarvisStore.getState().updateSettings({ autonomyLevel: 0 });
    const mission = await orchestrator.createMission("Research something", "s1");
    const result = await orchestrator.startMission(mission.id, toolCtx);
    expect(result?.status).toBe("FAILED");
    expect(result?.error).toMatch(/manual/i);
    expect(mockRunExecutionLoop).not.toHaveBeenCalled();
  });

  it("never starts a mission whose plan failed validation", async () => {
    const mission = await orchestrator.createMission("Research something", "s1");
    mission.status = "FAILED"; // simulate an invalid plan, as registerMission would set
    const result = await orchestrator.startMission(mission.id, toolCtx);
    expect(result?.status).toBe("FAILED");
    expect(mockRunExecutionLoop).not.toHaveBeenCalled();
  });

  it("pauseMission mid-flight stops the loop and PAUSED is returned from startMission", async () => {
    mockRunExecutionLoop.mockImplementation(async (mission: Mission, _ctx: MissionExecutionContext, flags: MissionControlFlags, onTick?: () => void) => {
      await sleep(20);
      mission.status = flags.paused ? "PAUSED" : "COMPLETED";
      onTick?.();
    });
    const mission = await orchestrator.createMission("Research something", "s1");
    const startPromise = orchestrator.startMission(mission.id, toolCtx);
    await sleep(5);
    orchestrator.pauseMission(mission.id);
    const result = await startPromise;
    expect(result?.status).toBe("PAUSED");
  });

  it("resumeMission re-enters the loop only for a PAUSED mission and completes it", async () => {
    mockRunExecutionLoop.mockImplementation(async (mission: Mission, _ctx: MissionExecutionContext, _flags: MissionControlFlags, onTick?: () => void) => {
      mission.status = "COMPLETED";
      mission.completedAt = Date.now();
      onTick?.();
    });
    const mission = await orchestrator.createMission("Research something", "s1");
    mission.status = "PAUSED";
    // Seed the live map directly as "paused" — bypassing a real pause,
    // since resumeMission only cares about the mission's current status.
    (orchestrator as unknown as { live: Map<string, Mission> }).live.set(mission.id, mission);

    const result = await orchestrator.resumeMission(mission.id, toolCtx);
    expect(result?.status).toBe("COMPLETED");
    expect(mockRunExecutionLoop).toHaveBeenCalledTimes(1);
  });

  it("resumeMission is a no-op for a mission that isn't PAUSED", async () => {
    const mission = await orchestrator.createMission("Research something", "s1");
    const result = await orchestrator.resumeMission(mission.id, toolCtx);
    expect(result?.status).toBe("DRAFT");
    expect(mockRunExecutionLoop).not.toHaveBeenCalled();
  });

  it("cancelMission marks a not-yet-running mission CANCELLED directly, without invoking the loop", async () => {
    const mission = await orchestrator.createMission("Research something", "s1");
    const result = await orchestrator.cancelMission(mission.id);
    expect(result?.status).toBe("CANCELLED");
    expect(mockRunExecutionLoop).not.toHaveBeenCalled();
  });

  it("cancelMission flips the control flag so an in-flight loop observes cancellation", async () => {
    let observedCancelled = false;
    mockRunExecutionLoop.mockImplementation(async (mission: Mission, _ctx: MissionExecutionContext, flags: MissionControlFlags, onTick?: () => void) => {
      await sleep(20);
      observedCancelled = flags.cancelled;
      mission.status = flags.cancelled ? "CANCELLED" : "COMPLETED";
      onTick?.();
    });
    const mission = await orchestrator.createMission("Research something", "s1");
    const startPromise = orchestrator.startMission(mission.id, toolCtx);
    await sleep(5);
    await orchestrator.cancelMission(mission.id);
    await startPromise;
    expect(observedCancelled).toBe(true);
  });

  it("authorizePlan / isPlanAuthorized round-trip per mission", async () => {
    const mission = await orchestrator.createMission("Research something", "s1");
    expect(orchestrator.isPlanAuthorized(mission.id)).toBe(false);
    orchestrator.authorizePlan(mission.id);
    expect(orchestrator.isPlanAuthorized(mission.id)).toBe(true);
  });

  it("resolveApproval delegates to the shared approvalManager", () => {
    const { id } = approvalManager.request({
      kind: "tool_call",
      missionId: "m-approval-test",
      taskId: "t1",
      agent: "research",
      toolName: "web_search",
      args: {},
      risk: "MEDIUM",
      reason: "test",
    });
    expect(orchestrator.resolveApproval(id, true)).toBe(true);
    expect(orchestrator.resolveApproval("nonexistent", true)).toBe(false);
  });
});
