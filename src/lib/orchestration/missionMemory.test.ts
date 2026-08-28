import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/memory/client", () => ({ memoryClient: { store: vi.fn() } }));

import { storeMissionMemory } from "./missionMemory";
import { memoryClient } from "@/lib/memory/client";
import { eventBus } from "@/lib/events/bus";
import { DEFAULT_MISSION_BUDGET } from "@/lib/planning/planTypes";
import { DEFAULT_AUTONOMY_LEVEL } from "@/lib/autonomy/autonomyLevels";
import type { Mission } from "@/lib/planning/planTypes";

const mockStore = vi.mocked(memoryClient.store);

function baseMission(overrides: Partial<Mission> = {}): Mission {
  const now = Date.now();
  return {
    id: "m1",
    sessionId: "s1",
    objective: "Research the best AI tools",
    status: "COMPLETED",
    tasks: [],
    autonomyLevel: DEFAULT_AUTONOMY_LEVEL,
    budget: DEFAULT_MISSION_BUDGET,
    planSource: "heuristic",
    createdAt: now,
    updatedAt: now,
    startedAt: now,
    completedAt: now,
    estimatedSteps: 1,
    completedSteps: 1,
    failureCount: 0,
    modelCallCount: 1,
    toolCallCount: 0,
    retryCount: 0,
    ...overrides,
  };
}

beforeEach(() => {
  mockStore.mockReset();
  mockStore.mockResolvedValue({} as never);
});

describe("storeMissionMemory", () => {
  it("stores a KNOWLEDGE record combining the objective and synthesis", async () => {
    await storeMissionMemory(baseMission({ synthesis: "Tool X is the best option." }));
    expect(mockStore).toHaveBeenCalledTimes(1);
    const call = mockStore.mock.calls[0][0];
    expect(call.type).toBe("KNOWLEDGE");
    expect(call.content).toContain("Research the best AI tools");
    expect(call.content).toContain("Tool X is the best option.");
    expect(call.source).toBe("ai");
  });

  it("does nothing when the mission has no synthesis", async () => {
    await storeMissionMemory(baseMission({ synthesis: undefined }));
    expect(mockStore).not.toHaveBeenCalled();
  });

  it("never stores a synthesis that looks like a secret", async () => {
    await storeMissionMemory(baseMission({ synthesis: "The API key is sk-abcdefghijklmnopqrstuvwxyz123456." }));
    expect(mockStore).not.toHaveBeenCalled();
  });

  it("never lets a memory-write failure throw", async () => {
    mockStore.mockRejectedValueOnce(new Error("storage full"));
    await expect(storeMissionMemory(baseMission({ synthesis: "fine" }))).resolves.toBeUndefined();
  });

  it("emits memory.extracted on a successful write", async () => {
    const seen: string[] = [];
    const off = eventBus.on("memory.extracted", (p) => seen.push(p.missionId));
    await storeMissionMemory(baseMission({ synthesis: "fine" }));
    off();
    expect(seen).toEqual(["m1"]);
  });
});
