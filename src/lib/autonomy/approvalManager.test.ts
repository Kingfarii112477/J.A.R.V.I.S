import { describe, it, expect, beforeEach } from "vitest";
import { approvalManager } from "./approvalManager";
import { eventBus } from "@/lib/events/bus";

beforeEach(() => {
  approvalManager.reset();
});

describe("ApprovalManager", () => {
  it("resolves the returned promise true when approved", async () => {
    const { id, promise } = approvalManager.request({ kind: "tool_call", missionId: "m1", toolName: "memory_delete", risk: "MEDIUM", reason: "test" });
    approvalManager.resolve(id, true);
    expect(await promise).toBe(true);
  });

  it("resolves the returned promise false when denied", async () => {
    const { id, promise } = approvalManager.request({ kind: "tool_call", missionId: "m1", toolName: "memory_delete", risk: "MEDIUM", reason: "test" });
    approvalManager.resolve(id, false);
    expect(await promise).toBe(false);
  });

  it("a denied action stays denied — resolving an unknown id again does nothing", () => {
    expect(approvalManager.resolve("nonexistent", true)).toBe(false);
  });

  it("emits approval.requested when a request is made", () => {
    const seen: string[] = [];
    const off = eventBus.on("approval.requested", (p) => seen.push(p.approvalId));
    const { id } = approvalManager.request({ kind: "tool_call", missionId: "m1", toolName: "n8n_workflow", risk: "HIGH", reason: "test" });
    off();
    expect(seen).toEqual([id]);
  });

  it("emits approval.granted/denied on resolution", async () => {
    const granted: string[] = [];
    const denied: string[] = [];
    const offG = eventBus.on("approval.granted", (p) => granted.push(p.approvalId));
    const offD = eventBus.on("approval.denied", (p) => denied.push(p.approvalId));
    const { id, promise } = approvalManager.request({ kind: "tool_call", missionId: "m1", toolName: "x", risk: "LOW", reason: "test" });
    approvalManager.resolve(id, true);
    await promise;
    offG();
    offD();
    expect(granted).toEqual([id]);
    expect(denied).toEqual([]);
  });

  it("lists pending approvals scoped to a mission", () => {
    approvalManager.request({ kind: "tool_call", missionId: "m1", toolName: "a", risk: "LOW", reason: "" });
    approvalManager.request({ kind: "tool_call", missionId: "m2", toolName: "b", risk: "LOW", reason: "" });
    expect(approvalManager.listPendingForMission("m1")).toHaveLength(1);
    expect(approvalManager.listPendingForMission("m2")).toHaveLength(1);
  });

  it("clearMission denies and removes every pending request for that mission", async () => {
    const { promise } = approvalManager.request({ kind: "tool_call", missionId: "m1", toolName: "a", risk: "LOW", reason: "" });
    approvalManager.clearMission("m1");
    expect(await promise).toBe(false);
    expect(approvalManager.listPendingForMission("m1")).toEqual([]);
  });
});
