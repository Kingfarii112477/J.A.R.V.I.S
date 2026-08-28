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
  /** 0..1 — how confident the source is that this content is accurate and
   * worth retaining (e.g. a explicit "remember X" scores higher than an
   * inferred profession guess). Distinct from `importance`, which is about
   * how much retrieval should weight it once trusted. */
  confidence: number;
  /** Last time this record actually influenced a response (a search hit
   * used as retrieved context) — distinct from `updatedAt`, which only
   * changes on edits. Drives recency in retrieval ranking. */
  lastUsedAt: number;
}

export type MemoryInput = Omit<MemoryRecord, "id" | "createdAt" | "updatedAt" | "embedding" | "lastUsedAt" | "confidence"> & {
  /** Optional at write time — providers fill a source-based default when
   * omitted, so every existing caller keeps compiling unchanged. */
  confidence?: number;
};

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
