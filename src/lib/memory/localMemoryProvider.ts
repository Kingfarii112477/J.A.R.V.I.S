import type { MemoryQuery, MemoryRecord, MemorySearchResult, MemoryType } from "@/types/memory";
import type { MemoryProvider } from "./provider";
import { MEMORY_TYPES } from "@/types/memory";
import { generateId } from "@/lib/utils/id";
import { localHashEmbeddingProvider, cosineSimilarity } from "./embeddings";

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
    const scored: MemorySearchResult[] = all
      .map((r) => {
        const keyword = keywordScore(text, r.content);
        const semantic = r.embedding ? cosineSimilarity(queryVector, r.embedding) : 0;
        // Blend both signals: keyword overlap is precise for exact terms,
        // the hashed embedding catches near-matches keyword overlap misses.
        return { ...r, score: keyword * 0.6 + Math.max(0, semantic) * 0.4 };
      })
      .filter((r) => r.score > 0.05)
      .sort((a, b) => b.score - a.score || b.importance - a.importance);
    return scored.slice(0, limit);
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
