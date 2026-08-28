import type { AgentId } from "./types";
import { agentRegistry } from "./registry";

interface AgentKeywordRule {
  agent: AgentId;
  test: RegExp;
}

// Order matters — first match wins, most specific first. Mirrors the
// established pattern in lib/ai/router.ts's classifyIntent: a
// deterministic keyword classifier, not a model call, so routing a task
// to an agent costs nothing and never contradicts itself between runs.
const RULES: AgentKeywordRule[] = [
  { agent: "security", test: /\b(risk|permission|audit|security check|vulnerab)/i },
  { agent: "automation", test: /\b(automat|workflow|n8n|trigger)/i },
  { agent: "memory", test: /\b(memory|remember|recall|forget)/i },
  { agent: "research", test: /\b(research|search|source|compare|investigate|find out|look up)/i },
  { agent: "coding", test: /\b(code|repository|repo|function|bug|test plan)/i },
  { agent: "analysis", test: /\b(analy[sz]e|diagnostic|telemetry|performance|health|inspect)/i },
  { agent: "planning", test: /\b(plan|task list|break ?down|organize)/i },
];

/** Deterministic capability-keyword router — the heuristic planner's
 * default agent assignment, and a fallback whenever an LLM-produced plan
 * names an agent id the registry doesn't recognize. Never returns an
 * agent the registry doesn't actually have. */
export function routeTaskToAgent(taskDescription: string): AgentId {
  for (const rule of RULES) {
    if (rule.test.test(taskDescription) && agentRegistry.getAgent(rule.agent)) {
      return rule.agent;
    }
  }
  return "orchestrator";
}
