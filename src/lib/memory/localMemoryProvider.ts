import type { MemoryQuery, MemoryRecord, MemorySearchResult, MemoryType } from "@/types/memory";
import type { MemoryProvider } from "./provider";
import { MEMORY_TYPES } from "@/types/memory";
import { generateId } from "@/lib/utils/id";
import { localHashEmbeddingProvider, cosineSimilarity } from "./embeddings";
import { defaultConfidenceFor } from "./provider";

const STORAGE_KEY = "jarvis-memory-records-v1";
const MAX_RECORDS = 2000;

function loadAll(): MemoryRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveAll(records: MemoryRecord[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(records.slice(-MAX_RECORDS)));
  } catch {
    // Storage unavailable (private mode, quota) — the current session's
    // in-memory copy (the caller's return value) still works; just won't
    // survive a reload.
  }
}

/** Real token-overlap keyword scorer — no embedding dependency, works
 * offline, and is genuinely useful for short factual memories even though
 * it's cruder than semantic search. lib/memory/embeddings.ts layers a
 * smarter re-rank on top of this when an embedding provider is available. */
function keywordScore(query: string, content: string): number {
  const queryTokens = new Set(query.toLowerCase().match(/[a-z0-9]+/g) ?? []);
  if (queryTokens.size === 0) return 0;
  const contentTokens = new Set(content.toLowerCase().match(/[a-z0-9]+/g) ?? []);
  let overlap = 0;
  for (const token of queryTokens) {
    if (contentTokens.has(token)) overlap += 1;
  }
  return overlap / queryTokens.size;
}

/** Gentle time decay — a record used/updated ~2 weeks ago still carries
 * about half its original recency weight rather than falling off a cliff. */
function recencyScore(timestamp: number, now: number): number {
  const ageDays = Math.max(0, now - timestamp) / (1000 * 60 * 60 * 24);
  return 1 / (1 + ageDays / 14);
}

/** Zero-configuration default memory backend — browser localStorage. */
export const localMemoryProvider: MemoryProvider = {
  id: "local",
  label: "Local (browser storage)",

  isAvailable() {
    return typeof window !== "undefined";
  },

  async storeMemory(input) {
    const now = Date.now();
    const record: MemoryRecord = {
      ...input,
      id: generateId("mem"),
      createdAt: now,
      updatedAt: now,
      lastUsedAt: now,
      confidence: input.confidence ?? defaultConfidenceFor(input.source),
      // Precompute a local hash embedding at write time so search doesn't
      // pay that cost per-query — see lib/memory/embeddings.ts for what
      // this is (and isn't: an approximate, offline fallback, not true
      // semantic understanding).
      embedding: await localHashEmbeddingProvider.embed(input.content),
    };
    const all = loadAll();
    all.push(record);
    saveAll(all);
    return record;
  },

  async retrieveMemories(query: MemoryQuery) {
    let records = loadAll();
    if (query.type) records = records.filter((r) => r.type === query.type);
    if (query.minImportance !== undefined) {
      records = records.filter((r) => r.importance >= query.minImportance!);
    }
    if (query.text) {
      const text = query.text.toLowerCase();
      records = records.filter((r) => r.content.toLowerCase().includes(text));
    }
    records = records.sort((a, b) => b.updatedAt - a.updatedAt);
    return query.limit ? records.slice(0, query.limit) : records;
  },

  async searchMemories(text, limit = 10) {
    const all = loadAll();
    const queryVector = await localHashEmbeddingProvider.embed(text);
    const now = Date.now();
    const scored: MemorySearchResult[] = all
      .map((r) => {
        const keyword = keywordScore(text, r.content);
        const semantic = r.embedding ? cosineSimilarity(queryVector, r.embedding) : 0;
        // Blend both signals: keyword overlap is precise for exact terms,
        // the hashed embedding catches near-matches keyword overlap misses.
        const relevance = keyword * 0.6 + Math.max(0, semantic) * 0.4;
        // Final ranking blends relevance, importance, recency, and
        // confidence — a highly relevant but stale/low-confidence memory
        // shouldn't outrank a slightly-less-relevant one the system
        // actually trusts and has used recently.
        const score =
          relevance * 0.55 + r.importance * 0.2 + recencyScore(r.lastUsedAt ?? r.updatedAt, now) * 0.15 + (r.confidence ?? 0.7) * 0.1;
        return { ...r, score };
      })
      .filter((r) => r.score > 0.05)
      .sort((a, b) => b.score - a.score || b.importance - a.importance);
    const top = scored.slice(0, limit);

    // A search hit means this memory actually informed a response — bump
    // lastUsedAt so future recency scoring reflects real usage, not just
    // edits. Best-effort: a persistence failure here shouldn't affect the
    // results already computed.
    if (top.length > 0) {
      const hitIds = new Set(top.map((r) => r.id));
      saveAll(all.map((r) => (hitIds.has(r.id) ? { ...r, lastUsedAt: now } : r)));
    }
    return top.map((r) => ({ ...r, lastUsedAt: now }));
  },

  async updateMemory(id, patch) {
    const all = loadAll();
    const idx = all.findIndex((r) => r.id === id);
    if (idx === -1) return null;
    const embedding = patch.content ? await localHashEmbeddingProvider.embed(patch.content) : all[idx].embedding;
    const updated: MemoryRecord = { ...all[idx], ...patch, embedding, updatedAt: Date.now() };
    all[idx] = updated;
    saveAll(all);
    return updated;
  },

  async deleteMemory(id) {
    const all = loadAll();
    const next = all.filter((r) => r.id !== id);
    const removed = next.length !== all.length;
    if (removed) saveAll(next);
    return removed;
  },

  async optimizeMemory() {
    // Drop the lowest-importance, oldest SYSTEM_EVENT/COMMAND records first
    // — these are the most disposable memory types — until we're back
    // under a reasonable working set, and de-duplicate exact repeats.
    const all = loadAll();
    const seen = new Set<string>();
    const deduped = all.filter((r) => {
      const key = `${r.type}:${r.content.trim().toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const TARGET_MAX = 500;
    let working = deduped;
    if (working.length > TARGET_MAX) {
      const disposable = working
        .filter((r) => r.type === "SYSTEM_EVENT" || r.type === "COMMAND")
        .sort((a, b) => a.importance - b.importance || a.createdAt - b.createdAt);
      const toRemove = new Set(disposable.slice(0, working.length - TARGET_MAX).map((r) => r.id));
      working = working.filter((r) => !toRemove.has(r.id));
    }

    const removed = all.length - working.length;
    saveAll(working);
    return { removed };
  },

  async clearAll() {
    const all = loadAll();
    saveAll([]);
    return { removed: all.length };
  },

  async getStats() {
    const all = loadAll();
    const byType = Object.fromEntries(MEMORY_TYPES.map((t) => [t, 0])) as Record<MemoryType, number>;
    for (const record of all) {
      byType[record.type] += 1;
    }
    return { total: all.length, byType };
  },
};
