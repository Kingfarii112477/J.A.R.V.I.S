import type { PermissionLevel } from "@/types/tools";

/** Logical agent roles — NOT separate LLM instances. Every agent's actual
 * work runs through the same ReasoningEngine (see orchestration/coordinator.ts);
 * an "agent" is a named capability/tool-access profile the orchestrator
 * assigns a task to, not a distinct model or process. */
export type AgentId =
  | "orchestrator"
  | "research"
  | "analysis"
  | "planning"
  | "coding"
  | "automation"
  | "memory"
  | "security";

export type AgentStatus = "idle" | "active" | "standby" | "error";

export interface AgentDefinition {
  id: AgentId;
  name: string;
  role: string;
  description: string;
  capabilities: string[];
  /** Tool names this agent may ever be given — enforced by the
   * orchestrator when it builds the agent's ReasoningEngine options
   * (allowedTools), never something the model itself can widen. */
  allowedTools: string[];
  /** Ceiling permission this agent may exercise without escalating to a
   * higher autonomy/approval check — mirrors ToolDefinition.permission,
   * but at the agent level (defense in depth: even a SAFE tool call from
   * a RESTRICTED-ceiling agent is blocked). */
  maxPermission: PermissionLevel;
  /** Prepended to the system prompt for any reasoning run this agent
   * drives — describes its role/voice, not secret instructions. */
  systemInstructions: string;
  maxIterations: number;
  maxToolCalls: number;
  timeoutMs: number;
}

/** Live, mutable status for one agent — distinct from AgentDefinition
 * (the static registry entry). Tracked by AgentRegistry per mission run. */
export interface AgentRuntimeState {
  agentId: AgentId;
  status: AgentStatus;
  currentTaskId: string | null;
  currentMissionId: string | null;
  lastResult: string | null;
  lastError: string | null;
  updatedAt: number;
}
