import type { MemoryStats, MemoryType } from "@/types/memory";
import type { MemoryProvider } from "./provider";
import { MEMORY_TYPES } from "@/types/memory";

const NOT_IMPLEMENTED = "Vector memory (pgvector / dedicated vector DB) is not implemented yet — this is an architecture placeholder for a future phase.";

/**
 * FutureVectorMemoryProvider — an explicit, honest stub satisfying the
 * MemoryProvider contract so the rest of the app (provider selector in
 * Settings, the resolver in index.ts) already has a real slot for true
 * vector search (e.g. Supabase pgvector) to land in later. isAvailable()
 * always returns false; every method throws rather than silently
 * pretending to work.
 */
export const vectorMemoryProvider: MemoryProvider = {
  id: "vector",
  label: "Vector search (not yet available)",

  isAvailable() {
    return false;
  },

  async storeMemory() {
    throw new Error(NOT_IMPLEMENTED);
  },
  async retrieveMemories() {
    throw new Error(NOT_IMPLEMENTED);
  },
  async searchMemories() {
    throw new Error(NOT_IMPLEMENTED);
  },
  async updateMemory() {
    throw new Error(NOT_IMPLEMENTED);
  },
  async deleteMemory() {
    throw new Error(NOT_IMPLEMENTED);
  },
  async optimizeMemory() {
    throw new Error(NOT_IMPLEMENTED);
  },
  async getStats() {
    const byType = Object.fromEntries(MEMORY_TYPES.map((t) => [t, 0])) as Record<MemoryType, number>;
    const stats: MemoryStats = { total: 0, byType };
    return stats;
  },
};
