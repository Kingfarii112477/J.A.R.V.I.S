import "server-only";
import type { ResearchProvider, ResearchResult } from "./provider";

/** Forwards a research query to a dedicated n8n workflow, if one is
 * configured. Distinct from the general chat N8N_WEBHOOK_URL — a research
 * workflow is expected to return a `results` array, not a chat reply. */
export const n8nResearchProvider: ResearchProvider = {
  id: "n8n",
  label: "n8n Research Workflow",

  isAvailable() {
    return Boolean(process.env.N8N_RESEARCH_WEBHOOK_URL);
  },

  async search(query: string): Promise<ResearchResult[]> {
    const url = process.env.N8N_RESEARCH_WEBHOOK_URL;
    if (!url) throw new Error("No n8n research workflow is configured.");

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, timestamp: new Date().toISOString(), source: "jarvis-ui" }),
      signal: AbortSignal.timeout(20_000),
    });

    if (!res.ok) throw new Error(`n8n research workflow returned ${res.status}`);

    const data = await res.json();
    const results = Array.isArray(data?.results) ? data.results : [];
    return results.map((r: { title?: string; url?: string; snippet?: string }) => ({
      title: r.title ?? "Untitled",
      url: r.url ?? "",
      snippet: r.snippet ?? "",
    }));
  },
};
