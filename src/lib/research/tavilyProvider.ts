import "server-only";
import type { ResearchProvider, ResearchResult } from "./provider";

/** Real Tavily search API integration — server-only (needs a secret key).
 * isAvailable() is false until TAVILY_API_KEY is set. */
export const tavilyResearchProvider: ResearchProvider = {
  id: "tavily",
  label: "Tavily Search",

  isAvailable() {
    return Boolean(process.env.TAVILY_API_KEY);
  },

  async search(query: string): Promise<ResearchResult[]> {
    const apiKey = process.env.TAVILY_API_KEY;
    if (!apiKey) throw new Error("Tavily is not configured (TAVILY_API_KEY missing).");

    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: apiKey, query, max_results: 5 }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Tavily search failed (${res.status}): ${body.slice(0, 200)}`);
    }

    const data = await res.json();
    const results = Array.isArray(data?.results) ? data.results : [];
    return results.map((r: { title?: string; url?: string; content?: string }) => ({
      title: r.title ?? "Untitled",
      url: r.url ?? "",
      snippet: (r.content ?? "").slice(0, 400),
    }));
  },
};
