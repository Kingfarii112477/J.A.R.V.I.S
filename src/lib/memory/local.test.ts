import { describe, it, expect, beforeEach } from "vitest";
import { loadMemoryState, saveMemoryState, optimizeMemory, getUsedGB, defaultMemoryCategories } from "./local";

beforeEach(() => {
  localStorage.clear();
});

describe("loadMemoryState", () => {
  it("returns sane defaults when nothing is persisted", () => {
    const state = loadMemoryState();
    expect(state.categories).toEqual(defaultMemoryCategories);
    expect(state.integrity).toBeGreaterThan(0);
  });

  it("round-trips through saveMemoryState", () => {
    const state = loadMemoryState();
    const mutated = { ...state, integrity: 42 };
    saveMemoryState(mutated);
    expect(loadMemoryState().integrity).toBe(42);
  });
});

describe("optimizeMemory", () => {
  it("reduces total used storage and never lifts integrity above 100", () => {
    const before = loadMemoryState();
    const beforeUsed = getUsedGB(before);

    const after = optimizeMemory(before);
    const afterUsed = getUsedGB(after);

    expect(afterUsed).toBeLessThan(beforeUsed);
    expect(after.integrity).toBeLessThanOrEqual(100);
    expect(after.lastOptimized).not.toBeNull();
  });

  it("never drops a category below the floor", () => {
    const tiny = {
      categories: defaultMemoryCategories.map((c) => ({ ...c, gb: 5 })),
      integrity: 99,
      lastOptimized: null,
    };
    const after = optimizeMemory(tiny);
    for (const cat of after.categories) {
      expect(cat.gb).toBeGreaterThanOrEqual(8);
    }
  });
});
