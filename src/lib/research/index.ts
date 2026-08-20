import "server-only";
import { tavilyResearchProvider } from "./tavilyProvider";
import { n8nResearchProvider } from "./n8nResearchProvider";
import type { ResearchProvider } from "./provider";

/** Tavily first, then a dedicated n8n research workflow, then nothing.
 * Never falls back to the general chat AI provider for "search results" —
 * that would mean inventing sources, which this system explicitly refuses
 * to do (see README / JARVIS_SYSTEM_PROMPT). */
export function resolveResearchProvider(): ResearchProvider | null {
  if (tavilyResearchProvider.isAvailable()) return tavilyResearchProvider;
  if (n8nResearchProvider.isAvailable()) return n8nResearchProvider;
  return null;
}
