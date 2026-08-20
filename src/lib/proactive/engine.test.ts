import { describe, it, expect } from "vitest";
import { evaluateProactiveConditions } from "./engine";
import type { JarvisTask } from "@/types/tasks";

const baseInput = {
  diagnosticsScore: 98,
  threatLevel: 5,
  tasks: [] as JarvisTask[],
  memoryRecordCount: 10,
  now: Date.now(),
  alreadyNotified: new Set<string>(),
};

describe("evaluateProactiveConditions", () => {
  it("stays silent when everything is healthy", () => {
    const result = evaluateProactiveConditions(baseInput);
    expect(result.notifications).toHaveLength(0);
  });

  it("warns once when diagnostics score drops below 80", () => {
    const result = evaluateProactiveConditions({ ...baseInput, diagnosticsScore: 65 });
    expect(result.notifications).toHaveLength(1);
    expect(result.notifications[0].title).toBe("Diagnostics");
    expect(result.add).toContain("diagnostics-degraded");
  });

  it("does not re-fire the diagnostics warning if already notified", () => {
    const result = evaluateProactiveConditions({
      ...baseInput,
      diagnosticsScore: 65,
      alreadyNotified: new Set(["diagnostics-degraded"]),
    });
    expect(result.notifications).toHaveLength(0);
  });

  it("clears the diagnostics-degraded key once the score recovers", () => {
    const result = evaluateProactiveConditions({
      ...baseInput,
      diagnosticsScore: 95,
      alreadyNotified: new Set(["diagnostics-degraded"]),
    });
    expect(result.remove).toContain("diagnostics-degraded");
  });

  it("warns on elevated threat level", () => {
    const result = evaluateProactiveConditions({ ...baseInput, threatLevel: 75 });
    expect(result.notifications.some((n) => n.title === "Tactical")).toBe(true);
  });

  it("notifies for a task due within 15 minutes but not one due in 2 hours", () => {
    const now = Date.now();
    const tasks: JarvisTask[] = [
      { id: "t1", title: "Soon", status: "PENDING", priority: "medium", createdAt: now, updatedAt: now, dueAt: now + 5 * 60_000 },
      { id: "t2", title: "Later", status: "PENDING", priority: "medium", createdAt: now, updatedAt: now, dueAt: now + 2 * 60 * 60_000 },
    ];
    const result = evaluateProactiveConditions({ ...baseInput, tasks, now });
    expect(result.notifications).toHaveLength(1);
    expect(result.notifications[0].message).toContain("Soon");
  });

  it("does not notify for a completed task even if its due date has passed", () => {
    const now = Date.now();
    const tasks: JarvisTask[] = [
      { id: "t1", title: "Done", status: "COMPLETED", priority: "medium", createdAt: now, updatedAt: now, dueAt: now + 5 * 60_000 },
    ];
    const result = evaluateProactiveConditions({ ...baseInput, tasks, now });
    expect(result.notifications).toHaveLength(0);
  });

  it("recommends memory optimization once the record count is high", () => {
    const result = evaluateProactiveConditions({ ...baseInput, memoryRecordCount: 500 });
    expect(result.notifications.some((n) => n.title === "Memory")).toBe(true);
  });

  it("clears the memory-optimize key once the count drops back down", () => {
    const result = evaluateProactiveConditions({
      ...baseInput,
      memoryRecordCount: 100,
      alreadyNotified: new Set(["memory-optimize"]),
    });
    expect(result.remove).toContain("memory-optimize");
  });
});
