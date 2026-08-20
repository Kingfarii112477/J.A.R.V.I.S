import type { MemoryInput, MemoryQuery, MemoryRecord, MemorySearchResult, MemoryStats } from "@/types/memory";

export type MemoryProviderId = "local" | "supabase" | "vector";

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
  getStats(): Promise<MemoryStats>;
}
