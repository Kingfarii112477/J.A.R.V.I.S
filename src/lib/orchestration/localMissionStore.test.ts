import { describe, it, expect, beforeEach } from "vitest";
import { localMissionStore } from "./localMissionStore";
import { createHeuristicPlan } from "@/lib/planning/planner";

beforeEach(() => {
  localStorage.clear();
});

describe("localMissionStore", () => {
  it("creates and retrieves a mission", async () => {
    const mission = createHeuristicPlan("Research something", "s1");
    await localMissionStore.createMission(mission);
    const fetched = await localMissionStore.getMission(mission.id);
    expect(fetched?.id).toBe(mission.id);
  });

  it("returns null for an unknown mission id", async () => {
    expect(await localMissionStore.getMission("nope")).toBeNull();
  });

  it("updateMission patches fields and returns the updated record", async () => {
    const mission = createHeuristicPlan("Research something", "s1");
    await localMissionStore.createMission(mission);
    const updated = await localMissionStore.updateMission(mission.id, { status: "RUNNING" });
    expect(updated?.status).toBe("RUNNING");
    expect((await localMissionStore.getMission(mission.id))?.status).toBe("RUNNING");
  });

  it("updateMission returns null for an unknown id", async () => {
    expect(await localMissionStore.updateMission("nope", { status: "RUNNING" })).toBeNull();
  });

  it("listMissions returns newest first", async () => {
    const a = createHeuristicPlan("first", "s1");
    await localMissionStore.createMission(a);
    await new Promise((r) => setTimeout(r, 5));
    const b = createHeuristicPlan("second", "s1");
    await localMissionStore.createMission(b);
    const list = await localMissionStore.listMissions();
    expect(list[0].id).toBe(b.id);
  });

  it("cancelMission marks the mission CANCELLED without deleting it", async () => {
    const mission = createHeuristicPlan("Research something", "s1");
    await localMissionStore.createMission(mission);
    const cancelled = await localMissionStore.cancelMission(mission.id);
    expect(cancelled?.status).toBe("CANCELLED");
    expect(await localMissionStore.getMission(mission.id)).not.toBeNull();
  });

  it("deleteMission permanently removes the record", async () => {
    const mission = createHeuristicPlan("Research something", "s1");
    await localMissionStore.createMission(mission);
    expect(await localMissionStore.deleteMission(mission.id)).toBe(true);
    expect(await localMissionStore.getMission(mission.id)).toBeNull();
  });
});
