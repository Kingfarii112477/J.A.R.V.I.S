"use client";

import { useEffect, useState, useCallback } from "react";
import { Search, Trash2, Info, X } from "lucide-react";
import { HudPanel } from "@/components/hud/HudPanel";
import { memoryClient } from "@/lib/memory/client";
import { useSound } from "@/hooks/useSound";
import { useEventListener } from "@/hooks/useEventListener";
import type { MemoryRecord, MemoryStats, MemoryType } from "@/types/memory";
import { MEMORY_TYPES } from "@/types/memory";
import { cn } from "@/lib/utils/cn";

const TYPE_COLOR: Record<MemoryType, string> = {
  USER_PROFILE: "#22d3ee",
  CONVERSATION: "#3b82f6",
  PREFERENCE: "#8b5cf6",
  TASK: "#34d399",
  FACT: "#67e8f9",
  SYSTEM_EVENT: "#526180",
  COMMAND: "#a855f7",
  KNOWLEDGE: "#f5b942",
};

function relativeTime(ts: number) {
  const diffMs = Date.now() - ts;
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function MemoryRecordsPanel() {
  const [records, setRecords] = useState<MemoryRecord[]>([]);
  const [stats, setStats] = useState<MemoryStats | null>(null);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<MemoryType | "ALL">("ALL");
  const [loading, setLoading] = useState(true);
  const playSound = useSound();

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [list, s] = await Promise.all([
        query.trim()
          ? memoryClient.search(query.trim(), 30)
          : memoryClient.retrieve({ type: typeFilter === "ALL" ? undefined : typeFilter, limit: 100 }),
        memoryClient.stats(),
      ]);
      setRecords(list);
      setStats(s);
    } catch {
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, [query, typeFilter]);

  useEffect(() => {
    const timer = setTimeout(refresh, 220);
    return () => clearTimeout(timer);
  }, [refresh]);

  useEventListener("memory.updated", () => refresh());

  async function handleDelete(id: string) {
    playSound("click");
    await memoryClient.remove(id);
    refresh();
  }

  const highlights = records
    .filter((r) => r.type === "USER_PROFILE" || r.type === "PREFERENCE")
    .sort((a, b) => b.importance - a.importance)
    .slice(0, 5);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-2 rounded-lg border border-cyan/15 bg-panel-strong px-3 py-2.5">
        <Info size={14} className="mt-0.5 shrink-0 text-cyan" />
        <p className="font-technical text-[10px] leading-relaxed tracking-[0.02em] text-text-secondary">
          <span className="text-cyan">STORED MEMORY</span> (below) persists across sessions.{" "}
          <span className="text-blue">CURRENT CONVERSATION</span> (Chat screen) resets when cleared or reloaded.{" "}
          <span className="text-text-muted">TEMPORARY CONTEXT</span> (tool results, per-request retrieval) is never saved.
        </p>
      </div>

      {highlights.length > 0 && (
        <HudPanel corners>
          <p className="font-body mb-2 text-sm font-medium text-text-primary">What J.A.R.V.I.S Remembers</p>
          <ul className="flex flex-col gap-1.5">
            {highlights.map((h) => (
              <li key={h.id} className="flex items-center gap-2 text-xs text-text-secondary">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: TYPE_COLOR[h.type] }} />
                {h.content}
              </li>
            ))}
          </ul>
        </HudPanel>
      )}

      <HudPanel>
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="hud-panel flex flex-1 items-center gap-2 rounded-full px-3 py-1.5">
            <Search size={14} className="text-text-muted" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search memories..."
              className="flex-1 bg-transparent text-sm text-text-primary outline-none placeholder:text-text-muted"
            />
            {query && (
              <button onClick={() => setQuery("")} aria-label="Clear search" className="text-text-muted hover:text-text-primary">
                <X size={13} />
              </button>
            )}
          </div>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as MemoryType | "ALL")}
            disabled={!!query}
            className="rounded-lg border border-cyan/20 bg-panel-strong px-3 py-1.5 text-xs text-text-primary outline-none disabled:opacity-40"
          >
            <option value="ALL">All types</option>
            {MEMORY_TYPES.map((t) => (
              <option key={t} value={t}>
                {t.replace("_", " ")}
              </option>
            ))}
          </select>
        </div>

        <div className="max-h-80 overflow-y-auto">
          {loading && records.length === 0 ? (
            <p className="font-technical py-6 text-center text-xs text-text-muted">LOADING MEMORY...</p>
          ) : records.length === 0 ? (
            <p className="font-technical py-6 text-center text-xs text-text-muted">
              {query ? "NO MATCHING MEMORIES" : "NO MEMORIES STORED YET"}
            </p>
          ) : (
            <ul className="divide-y divide-cyan/10">
              {records.map((r) => (
                <li key={r.id} className="flex items-start gap-3 py-2.5">
                  <span
                    className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ background: TYPE_COLOR[r.type], boxShadow: `0 0 6px ${TYPE_COLOR[r.type]}` }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-text-primary">{r.content}</p>
                    <div className="mt-1 flex items-center gap-2">
                      <span className="font-technical text-[9px] tracking-[0.08em] text-text-muted">{r.type.replace("_", " ")}</span>
                      <span className="text-text-muted">·</span>
                      <span className="font-technical text-[9px] tracking-[0.08em] text-text-muted">{relativeTime(r.updatedAt)}</span>
                      <span className="text-text-muted">·</span>
                      <span className="font-technical text-[9px] tracking-[0.08em] text-text-muted">
                        IMPORTANCE {Math.round(r.importance * 100)}%
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDelete(r.id)}
                    aria-label={`Delete memory: ${r.content}`}
                    className="shrink-0 text-text-muted transition-colors hover:text-danger"
                  >
                    <Trash2 size={13} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {stats && (
          <div className="mt-3 flex flex-wrap gap-1.5 border-t border-cyan/10 pt-3">
            {MEMORY_TYPES.filter((t) => stats.byType[t] > 0).map((t) => (
              <span
                key={t}
                className={cn("font-technical rounded-full border px-2 py-0.5 text-[9px] tracking-[0.06em]")}
                style={{ borderColor: `${TYPE_COLOR[t]}40`, color: TYPE_COLOR[t] }}
              >
                {t.replace("_", " ")} {stats.byType[t]}
              </span>
            ))}
            <span className="font-technical ml-auto text-[9px] tracking-[0.08em] text-text-muted">{stats.total} TOTAL RECORDS</span>
          </div>
        )}
      </HudPanel>
    </div>
  );
}
