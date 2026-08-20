"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Search, Globe, ExternalLink, Loader2, AlertTriangle } from "lucide-react";
import { HudPanel } from "@/components/hud/HudPanel";
import { searchWeb, getResearchStatus, type ResearchStatus } from "@/lib/research/client";
import type { ResearchResult } from "@/lib/research/provider";
import { cn } from "@/lib/utils/cn";

type QueryState = "idle" | "loading" | "done" | "error";

/**
 * Research Mode: a real web-search surface backed by the ResearchProvider
 * abstraction (Tavily, then a dedicated n8n workflow). Never invents
 * sources — an unconfigured deployment shows an explicit "not connected"
 * state instead of an empty success, exactly like the rest of the app's
 * real-vs-simulated data labeling.
 */
export function ResearchPanel() {
  const [status, setStatus] = useState<ResearchStatus | null>(null);
  const [query, setQuery] = useState("");
  const [queryState, setQueryState] = useState<QueryState>("idle");
  const [results, setResults] = useState<ResearchResult[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getResearchStatus().then(setStatus);
  }, []);

  async function handleSearch(e: FormEvent) {
    e.preventDefault();
    const text = query.trim();
    if (!text || queryState === "loading") return;

    setQueryState("loading");
    setError(null);
    const outcome = await searchWeb(text);

    if (!outcome.available) {
      setQueryState("error");
      setError("No research provider is configured on this deployment.");
      return;
    }
    if (outcome.error) {
      setQueryState("error");
      setError(outcome.error);
      return;
    }
    setResults(outcome.results);
    setQueryState("done");
  }

  const connected = status?.available === true;

  return (
    <div className="px-1">
      <div className="mb-2 flex items-center justify-between">
        <p className="font-technical text-[10px] tracking-[0.2em] text-text-muted">RESEARCH AGENT</p>
        <span
          className={cn(
            "font-technical rounded-full border px-2 py-0.5 text-[9px] tracking-[0.1em]",
            connected ? "border-success/30 text-success" : "border-text-muted/30 text-text-muted"
          )}
        >
          {status === null ? "CHECKING…" : connected ? `CONNECTED — ${status.label}` : "NOT CONNECTED"}
        </span>
      </div>

      <HudPanel className="flex flex-col gap-3">
        <form onSubmit={handleSearch} className="flex items-center gap-2">
          <Globe size={14} className="shrink-0 text-cyan" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search the web…"
            aria-label="Research query"
            className="flex-1 bg-transparent text-sm text-text-primary outline-none placeholder:text-text-muted"
          />
          <button
            type="submit"
            disabled={queryState === "loading" || !query.trim()}
            className="flex items-center gap-1.5 rounded-lg border border-cyan/25 px-3 py-1.5 font-technical text-[10px] tracking-[0.1em] text-cyan transition-colors hover:bg-cyan/10 disabled:opacity-40"
          >
            {queryState === "loading" ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />}
            SEARCH
          </button>
        </form>

        {status !== null && !connected && (
          <p className="font-technical text-[11px] leading-relaxed text-text-muted">
            No research provider is configured. Set <code className="text-text-secondary">TAVILY_API_KEY</code> or{" "}
            <code className="text-text-secondary">N8N_WEBHOOK_URL</code> to bring this online.
          </p>
        )}

        {queryState === "error" && error && (
          <div className="flex items-center gap-2 rounded-lg border border-danger/25 bg-danger/5 px-3 py-2 text-danger">
            <AlertTriangle size={13} />
            <span className="font-technical text-[11px] tracking-[0.02em]">{error}</span>
          </div>
        )}

        {queryState === "done" && results.length === 0 && (
          <p className="font-technical text-[11px] text-text-muted">No results found.</p>
        )}

        {queryState === "done" && results.length > 0 && (
          <ul className="flex flex-col gap-2.5">
            {results.map((r, i) => (
              <li key={`${r.url}-${i}`} className="rounded-lg bg-panel-strong px-3 py-2.5">
                <a
                  href={r.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-sm font-medium text-cyan hover:underline"
                >
                  {r.title}
                  <ExternalLink size={11} className="shrink-0" />
                </a>
                <p className="mt-1 truncate font-technical text-[10px] text-text-muted">{r.url}</p>
                <p className="mt-1.5 text-xs leading-relaxed text-text-secondary">{r.snippet}</p>
              </li>
            ))}
          </ul>
        )}
      </HudPanel>
    </div>
  );
}
