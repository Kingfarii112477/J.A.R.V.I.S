/**
 * Real structured memory records — what J.A.R.V.I.S actually remembers
 * about the user and the session. Distinct from lib/memory/local.ts, which
 * simulates memory *capacity* (the TB gauges on the Memory Core screen).
 * These are two different concerns: one is a decorative-but-consistent
 * storage-health simulation, the other is genuine retrievable content.
 */
export type MemoryType =
  | "USER_PROFILE"
  | "CONVERSATION"
  | "PREFERENCE"
  | "TASK"
  | "FACT"
  | "SYSTEM_EVENT"
  | "COMMAND"
  | "KNOWLEDGE";

export const MEMORY_TYPES: MemoryType[] = [
  "USER_PROFILE",
  "CONVERSATION",
  "PREFERENCE",
  "TASK",
  "FACT",
  "SYSTEM_EVENT",
  "COMMAND",
  "KNOWLEDGE",
];

export type MemorySource = "user" | "ai" | "system";

export interface MemoryRecord {
  id: string;
  type: MemoryType;
  content: string;
  /** 0..1 — how much this should influence future retrieval/ranking. */
  importance: number;
  createdAt: number;
  updatedAt: number;
  source: MemorySource;
  metadata?: Record<string, unknown>;
  /** Present only when an embedding provider produced one; absent memories
   * fall back to keyword matching in search. */
  embedding?: number[];
}

export type MemoryInput = Omit<MemoryRecord, "id" | "createdAt" | "updatedAt" | "embedding">;

export interface MemoryQuery {
  type?: MemoryType;
  text?: string;
  limit?: number;
  minImportance?: number;
}

export interface MemoryStats {
  total: number;
  byType: Record<MemoryType, number>;
}

export interface MemorySearchResult extends MemoryRecord {
  /** 0..1 relevance score for this query — 1 for exact/keyword hits when no
   * embedding provider is active, cosine similarity when one is. */
  score: number;
}
