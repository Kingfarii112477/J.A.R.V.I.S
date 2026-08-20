import type { MemoryCategory } from "@/types/jarvis";

/**
 * Phase 1 memory persistence: browser localStorage only. This is explicitly
 * a UI-level simulation of a memory subsystem, not a real AI memory store —
 * see the "Memory Core" screen copy, which labels it as such. The shape is
 * designed so a future backend (e.g. a vector database over Supabase) can
 * be swapped in behind loadMemoryState/saveMemoryState without touching
 * the UI.
 */
const STORAGE_KEY = "jarvis-memory-core-v1";

export interface MemoryState {
  categories: MemoryCategory[];
  integrity: number;
  lastOptimized: number | null;
}

export const defaultMemoryCategories: MemoryCategory[] = [
  { id: "user", label: "User Memories", gb: 812, color: "#22d3ee", icon: "user" },
  { id: "logs", label: "System Logs", gb: 256, color: "#8b5cf6", icon: "file-text" },
  { id: "knowledge", label: "AI Knowledge", gb: 512, color: "#3b82f6", icon: "brain-circuit" },
  { id: "patterns", label: "Learned Patterns", gb: 256, color: "#a855f7", icon: "share-2" },
  { id: "tactical", label: "Tactical Data", gb: 256, color: "#34d399", icon: "crosshair" },
];

export const TOTAL_MEMORY_GB = 2400;

const defaultState: MemoryState = {
  categories: defaultMemoryCategories,
  integrity: 99,
  lastOptimized: null,
};

export function loadMemoryState(): MemoryState {
  if (typeof window === "undefined") return defaultState;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState;
    const parsed = JSON.parse(raw) as MemoryState;
    if (!parsed.categories?.length) return defaultState;
    return parsed;
  } catch {
    return defaultState;
  }
}

export function saveMemoryState(state: MemoryState) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage unavailable (private mode, quota) — fail silently, in-memory
    // state still works for the current session.
  }
}

export function getUsedGB(state: MemoryState) {
  return state.categories.reduce((sum, c) => sum + c.gb, 0);
}

export function getMemorySummary() {
  const state = loadMemoryState();
  const used = getUsedGB(state);
  return {
    totalGB: TOTAL_MEMORY_GB,
    usedGB: used,
    availableGB: TOTAL_MEMORY_GB - used,
    integrity: state.integrity,
  };
}

/** Optimize: trims ~4-9% off each category (simulated compaction) and
 * nudges integrity back toward 100. */
export function optimizeMemory(state: MemoryState): MemoryState {
  const categories = state.categories.map((c) => ({
    ...c,
    gb: Math.max(8, Math.round(c.gb * (1 - (0.04 + Math.random() * 0.05)))),
  }));
  return {
    categories,
    integrity: Math.min(100, state.integrity + Math.round(Math.random() * 3) + 1),
    lastOptimized: Date.now(),
  };
}
