import type { AgentDefinition } from "./types";
import type { ReasoningOptions } from "@/lib/reasoning/engine";

/** Everything the orchestrator's coordinator needs to run one MissionTask
 * through the shared ReasoningEngine as a given agent — never a
 * different execution path per agent, just different scoping. */
export interface AgentExecutionConfig {
  /** Prepended ahead of the task's own objective text so the model
   * adopts the agent's voice/role for this run. */
  systemPreamble: string;
  reasoningOptions: ReasoningOptions;
}

/** Pure factory — given an agent's static definition and this task's
 * explicit tool subset (already validated as ⊆ agent.allowedTools by
 * planValidator), produces the ReasoningEngine configuration for one
 * task run. No side effects, no registry mutation. */
export function createAgentExecutionConfig(agent: AgentDefinition, taskTools: string[], signal?: AbortSignal): AgentExecutionConfig {
  const allowedTools = taskTools.filter((t) => agent.allowedTools.includes(t));
  return {
    systemPreamble: `[Acting as ${agent.name} — ${agent.role}] ${agent.systemInstructions}`,
    reasoningOptions: {
      maxIterations: agent.maxIterations,
      maxToolCalls: agent.maxToolCalls,
      timeoutMs: agent.timeoutMs,
      allowedTools,
      signal,
    },
  };
}
