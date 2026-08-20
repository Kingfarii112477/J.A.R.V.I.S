export interface ToolRouteMatch {
  toolName: string;
  args: Record<string, unknown>;
}

/**
 * Deterministic text → tool matcher. This is NOT LLM function-calling —
 * there is no model deciding which tool to invoke or with what arguments,
 * which means there's no way for a hallucinated tool call to slip through.
 * It's the same integrity model as lib/commands/dispatcher.ts, just scoped
 * to the newer Tool Registry (calculator/time/weather/web search/memory
 * search) instead of system commands. Checked *after* dispatchCommand in
 * the message pipeline, so it only ever sees text the dispatcher didn't
 * already recognize as a system command.
 */
export function routeToTool(text: string): ToolRouteMatch | null {
  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();

  const calcPrefix = trimmed.match(/^(?:what(?:'s| is)\s+|calculate\s+)(.+?)\??$/i);
  const calcCandidate = (calcPrefix ? calcPrefix[1] : trimmed).trim();
  if (/^[\d\s+\-*/^().]+$/.test(calcCandidate) && /[0-9]/.test(calcCandidate) && /[+\-*/^]/.test(calcCandidate)) {
    return { toolName: "calculator", args: { expression: calcCandidate } };
  }

  if (/^what(?:'s| is) the time\b/.test(lower) || /^what time is it\b/.test(lower)) {
    return { toolName: "time", args: {} };
  }

  const weatherMatch = trimmed.match(/weather (?:in|for) ([a-z\s,'-]+?)\??$/i);
  if (weatherMatch) {
    return { toolName: "weather", args: { city: weatherMatch[1].trim() } };
  }

  const searchMatch = trimmed.match(/^(?:search(?: the web)? for|look up|google)\s+(.+)$/i);
  if (searchMatch) {
    return { toolName: "web_search", args: { query: searchMatch[1].trim() } };
  }

  const memorySearchMatch = trimmed.match(
    /^(?:what do you remember about|search (?:my )?memory for|recall|memory search)\s+(.+)$/i
  );
  if (memorySearchMatch) {
    return { toolName: "memory_search", args: { query: memorySearchMatch[1].trim() } };
  }

  return null;
}
