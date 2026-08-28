import { describe, it, expect, beforeEach } from "vitest";
import { localMemoryProvider } from "./localMemoryProvider";

beforeEach(() => {
  localStorage.clear();
});

describe("localMemoryProvider", () => {
  it("stores a memory and assigns id/timestamps", async () => {
    const record = await localMemoryProvider.storeMemory({
      type: "PREFERENCE",
      content: "Preferred language is English.",
      importance: 0.8,
      source: "user",
    });
    expect(record.id).toBeTruthy();
    expect(record.createdAt).toBeGreaterThan(0);
    expect(record.updatedAt).toBe(record.createdAt);
  });

  it("assigns a source-based default confidence when none is given", async () => {
    const userRecord = await localMemoryProvider.storeMemory({ type: "FACT", content: "a", importance: 0.5, source: "user" });
    const aiRecord = await localMemoryProvider.storeMemory({ type: "FACT", content: "b", importance: 0.5, source: "ai" });
    expect(userRecord.confidence).toBeGreaterThan(aiRecord.confidence);
    expect(userRecord.confidence).toBeGreaterThan(0);
    expect(userRecord.confidence).toBeLessThanOrEqual(1);
  });

  it("respects an explicit confidence when provided", async () => {
    const record = await localMemoryProvider.storeMemory({ type: "FACT", content: "a", importance: 0.5, source: "user", confidence: 0.3 });
    expect(record.confidence).toBe(0.3);
  });

  it("sets lastUsedAt to the creation time on store", async () => {
    const record = await localMemoryProvider.storeMemory({ type: "FACT", content: "a", importance: 0.5, source: "user" });
    expect(record.lastUsedAt).toBe(record.createdAt);
  });

  it("retrieves memories filtered by type and minImportance", async () => {
    await localMemoryProvider.storeMemory({ type: "FACT", content: "The sky is blue.", importance: 0.2, source: "system" });
    await localMemoryProvider.storeMemory({ type: "PREFERENCE", content: "Likes dark mode.", importance: 0.9, source: "user" });

    const facts = await localMemoryProvider.retrieveMemories({ type: "FACT" });
    expect(facts).toHaveLength(1);
    expect(facts[0].content).toContain("sky");

    const important = await localMemoryProvider.retrieveMemories({ minImportance: 0.5 });
    expect(important).toHaveLength(1);
    expect(important[0].type).toBe("PREFERENCE");
  });

  it("searchMemories ranks by keyword overlap and returns a score", async () => {
    await localMemoryProvider.storeMemory({ type: "FACT", content: "The user's favorite color is blue.", importance: 0.5, source: "user" });
    await localMemoryProvider.storeMemory({ type: "FACT", content: "Unrelated fact about the weather.", importance: 0.5, source: "user" });

    const results = await localMemoryProvider.searchMemories("favorite color");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].content).toContain("favorite color");
    expect(results[0].score).toBeGreaterThan(0);
  });

  it("bumps lastUsedAt on records returned by a search hit", async () => {
    const record = await localMemoryProvider.storeMemory({ type: "FACT", content: "The user's favorite color is blue.", importance: 0.5, source: "user" });
    await new Promise((r) => setTimeout(r, 5));
    const results = await localMemoryProvider.searchMemories("favorite color");
    expect(results[0].lastUsedAt).toBeGreaterThan(record.lastUsedAt);

    const stored = await localMemoryProvider.retrieveMemories({});
    expect(stored.find((r) => r.id === record.id)!.lastUsedAt).toBeGreaterThan(record.lastUsedAt);
  });

  it("ranks a more important, higher-confidence memory above a lower one at similar relevance", async () => {
    await localMemoryProvider.storeMemory({ type: "FACT", content: "Project deadline is Friday.", importance: 0.2, source: "ai", confidence: 0.3 });
    await localMemoryProvider.storeMemory({ type: "FACT", content: "Project deadline is Friday.", importance: 0.9, source: "user", confidence: 0.95 });
    const results = await localMemoryProvider.searchMemories("project deadline");
    expect(results[0].importance).toBe(0.9);
  });

  it("updateMemory patches content and bumps updatedAt", async () => {
    const record = await localMemoryProvider.storeMemory({ type: "TASK", content: "Draft report", importance: 0.5, source: "user" });
    await new Promise((r) => setTimeout(r, 5));
    const updated = await localMemoryProvider.updateMemory(record.id, { content: "Draft report (done)" });
    expect(updated?.content).toBe("Draft report (done)");
    expect(updated!.updatedAt).toBeGreaterThan(record.updatedAt);
  });

  it("updateMemory returns null for an unknown id", async () => {
    const result = await localMemoryProvider.updateMemory("does-not-exist", { content: "x" });
    expect(result).toBeNull();
  });

  it("deleteMemory removes the record and reports success", async () => {
    const record = await localMemoryProvider.storeMemory({ type: "FACT", content: "temp", importance: 0.1, source: "system" });
    const deleted = await localMemoryProvider.deleteMemory(record.id);
    expect(deleted).toBe(true);
    const stats = await localMemoryProvider.getStats();
    expect(stats.total).toBe(0);
  });

  it("optimizeMemory de-duplicates identical records", async () => {
    await localMemoryProvider.storeMemory({ type: "COMMAND", content: "run diagnostics", importance: 0.1, source: "system" });
    await localMemoryProvider.storeMemory({ type: "COMMAND", content: "run diagnostics", importance: 0.1, source: "system" });
    const { removed } = await localMemoryProvider.optimizeMemory();
    expect(removed).toBeGreaterThanOrEqual(1);
    const stats = await localMemoryProvider.getStats();
    expect(stats.total).toBe(1);
  });

  it("clearAll deletes every record and reports how many were removed", async () => {
    await localMemoryProvider.storeMemory({ type: "FACT", content: "a", importance: 0.1, source: "user" });
    await localMemoryProvider.storeMemory({ type: "TASK", content: "b", importance: 0.1, source: "user" });
    const { removed } = await localMemoryProvider.clearAll();
    expect(removed).toBe(2);
    const stats = await localMemoryProvider.getStats();
    expect(stats.total).toBe(0);
  });

  it("getStats buckets counts by type", async () => {
    await localMemoryProvider.storeMemory({ type: "FACT", content: "a", importance: 0.1, source: "user" });
    await localMemoryProvider.storeMemory({ type: "FACT", content: "b", importance: 0.1, source: "user" });
    await localMemoryProvider.storeMemory({ type: "TASK", content: "c", importance: 0.1, source: "user" });
    const stats = await localMemoryProvider.getStats();
    expect(stats.total).toBe(3);
    expect(stats.byType.FACT).toBe(2);
    expect(stats.byType.TASK).toBe(1);
  });
});
