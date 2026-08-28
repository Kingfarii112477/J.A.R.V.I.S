import type { MemoryInput, MemoryQuery, MemoryRecord, MemorySearchResult, MemorySource, MemoryStats } from "@/types/memory";

export type MemoryProviderId = "local" | "supabase" | "vector";

/** Source-based default confidence when a caller doesn't supply one —
 * something the user stated directly is more trustworthy than something
 * the AI inferred or a system event logged automatically. */
export function defaultConfidenceFor(source: MemorySource): number {
  if (source === "user") return 0.9;
  if (source === "system") return 0.75;
  return 0.6;
}

/**
 * The contract every memory backend implements. LocalMemoryProvider is the
 * only one active by default (no configuration needed); SupabaseMemoryProvider
 * and VectorMemoryProvider are real implementations that stay dormant until
 * their environment variables are set (see isAvailable()) — the app never
 * pretends a disconnected backend is connected.
 */
export interface MemoryProvider {
  id: MemoryProviderId;
  label: string;
  isAvailable(): boolean;

  storeMemory(input: MemoryInput): Promise<MemoryRecord>;
  retrieveMemories(query: MemoryQuery): Promise<MemoryRecord[]>;
  searchMemories(text: string, limit?: number): Promise<MemorySearchResult[]>;
  updateMemory(id: string, patch: Partial<MemoryInput>): Promise<MemoryRecord | null>;
  deleteMemory(id: string): Promise<boolean>;
  optimizeMemory(): Promise<{ removed: number }>;
  /** Deletes every stored record for this provider. Destructive and
   * irreversible — callers (the `memory clear` terminal command) must get
   * an explicit second confirmation from the user before calling this. */
  clearAll(): Promise<{ removed: number }>;
  getStats(): Promise<MemoryStats>;
}
