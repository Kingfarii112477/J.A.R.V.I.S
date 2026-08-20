import "server-only";
import type { MemoryQuery, MemoryRecord, MemorySearchResult, MemoryStats, MemoryType } from "@/types/memory";
import type { MemoryProvider } from "./provider";
import { MEMORY_TYPES } from "@/types/memory";

/**
 * Real Supabase-backed memory provider — talks to Supabase's PostgREST API
 * directly over fetch (no @supabase/supabase-js dependency needed for this
 * scope). Server-only: SUPABASE_SERVICE_ROLE_KEY must never reach the
 * client, so this provider is only ever instantiated from an API route.
 *
 * Expects a table (default name `jarvis_memories`) shaped like:
 *   id text primary key, type text, content text, importance float8,
 *   created_at timestamptz, updated_at timestamptz, source text,
 *   metadata jsonb
 * isAvailable() is false — and every method throws a clear "not
 * configured" error — until SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are
 * both set. Nothing here is faked or mocked; it's untested against a live
 * project simply because none is provisioned in this environment.
 */

const TABLE = process.env.SUPABASE_MEMORY_TABLE || "jarvis_memories";

function config() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return { url: url.replace(/\/$/, ""), key };
}

function requireConfig() {
  const cfg = config();
  if (!cfg) throw new Error("Supabase memory provider is not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing).");
  return cfg;
}

async function restFetch(path: string, init: RequestInit = {}) {
  const { url, key } = requireConfig();
  const res = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Supabase REST error ${res.status}: ${body.slice(0, 300)}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

interface SupabaseRow {
  id: string;
  type: MemoryType;
  content: string;
  importance: number;
  created_at: string;
  updated_at: string;
  source: MemoryRecord["source"];
  metadata: Record<string, unknown> | null;
}

function rowToRecord(row: SupabaseRow): MemoryRecord {
  return {
    id: row.id,
    type: row.type,
    content: row.content,
    importance: row.importance,
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
    source: row.source,
    metadata: row.metadata ?? undefined,
  };
}

export const supabaseMemoryProvider: MemoryProvider = {
  id: "supabase",
  label: "Supabase (Postgres)",

  isAvailable() {
    return config() !== null;
  },

  async storeMemory(input) {
    const [row] = (await restFetch(TABLE, {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        type: input.type,
        content: input.content,
        importance: input.importance,
        source: input.source,
        metadata: input.metadata ?? null,
      }),
    })) as SupabaseRow[];
    return rowToRecord(row);
  },

  async retrieveMemories(query: MemoryQuery) {
    const params = new URLSearchParams();
    if (query.type) params.set("type", `eq.${query.type}`);
    if (query.minImportance !== undefined) params.set("importance", `gte.${query.minImportance}`);
    if (query.text) params.set("content", `ilike.*${query.text}*`);
    params.set("order", "updated_at.desc");
    if (query.limit) params.set("limit", String(query.limit));
    const rows = (await restFetch(`${TABLE}?${params.toString()}`)) as SupabaseRow[];
    return rows.map(rowToRecord);
  },

  async searchMemories(text, limit = 10) {
    const params = new URLSearchParams();
    params.set("content", `ilike.*${text}*`);
    params.set("order", "importance.desc,updated_at.desc");
    params.set("limit", String(limit));
    const rows = (await restFetch(`${TABLE}?${params.toString()}`)) as SupabaseRow[];
    return rows.map((row) => ({ ...rowToRecord(row), score: 1 })) as MemorySearchResult[];
  },

  async updateMemory(id, patch) {
    const body: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (patch.content !== undefined) body.content = patch.content;
    if (patch.importance !== undefined) body.importance = patch.importance;
    if (patch.metadata !== undefined) body.metadata = patch.metadata;
    if (patch.type !== undefined) body.type = patch.type;

    const rows = (await restFetch(`${TABLE}?id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(body),
    })) as SupabaseRow[];
    return rows[0] ? rowToRecord(rows[0]) : null;
  },

  async deleteMemory(id) {
    await restFetch(`${TABLE}?id=eq.${encodeURIComponent(id)}`, { method: "DELETE" });
    return true;
  },

  async optimizeMemory() {
    // A real dedup/compaction pass would run as a Postgres function;
    // without one provisioned, this provider reports nothing removed
    // rather than guessing at data it can't safely bulk-mutate over REST.
    return { removed: 0 };
  },

  async getStats() {
    const byType = Object.fromEntries(MEMORY_TYPES.map((t) => [t, 0])) as Record<MemoryType, number>;
    let total = 0;
    for (const type of MEMORY_TYPES) {
      const { url, key } = requireConfig();
      const res = await fetch(`${url}/rest/v1/${TABLE}?type=eq.${type}&select=id`, {
        headers: { apikey: key, Authorization: `Bearer ${key}`, Prefer: "count=exact" },
      });
      const count = Number(res.headers.get("content-range")?.split("/")[1] ?? 0);
      byType[type] = count;
      total += count;
    }
    const stats: MemoryStats = { total, byType };
    return stats;
  },
};
