"use client";

import type { ResearchResult } from "./provider";

export interface WebSearchOutcome {
  available: boolean;
  results: ResearchResult[];
  error?: string;
}

export interface ResearchStatus {
  available: boolean;
  providerId: string | null;
  label: string | null;
}

/** Which provider (if any) is actually configured — for the Research Mode
 * panel's connection badge, never for deciding whether to fabricate
 * results (searchWeb's own unavailable check already handles that). */
export async function getResearchStatus(): Promise<ResearchStatus> {
  try {
    const res = await fetch("/api/research");
    if (!res.ok) return { available: false, providerId: null, label: null };
    return await res.json();
  } catch {
    return { available: false, providerId: null, label: null };
  }
}

/** Client-side entry point for "search the web" — the web_search tool and
 * the Research Mode UI both call this. Never invents results: an
 * unconfigured backend comes back as `available: false`, not an empty
 * success. */
export async function searchWeb(query: string): Promise<WebSearchOutcome> {
  try {
    const res = await fetch("/api/research", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    });
    const data = await res.json();
    if (res.status === 503 || data.unavailable) {
      return { available: false, results: [] };
    }
    if (!res.ok) {
      return { available: true, results: [], error: data.error ?? "Research request failed." };
    }
    return { available: true, results: data.results ?? [] };
  } catch (err) {
    return { available: true, results: [], error: err instanceof Error ? err.message : "Network error." };
  }
}
