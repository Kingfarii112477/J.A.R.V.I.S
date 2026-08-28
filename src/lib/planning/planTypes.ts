import type { AgentId } from "@/lib/agents/types";
import type { AutonomyLevel } from "@/lib/autonomy/autonomyLevels";

/** A task within a Mission's plan — distinct from types/tasks.ts's
 * JarvisTask (the simple user-facing to-do list the task_create/task_list
 * tools manage). A MissionTask is an internal execution unit the
 * orchestrator drives through the ReasoningEngine; it never appears in
 * the Dashboard task panel. */
export type MissionTaskStatus =
  | "PENDING" // dependencies not yet satisfied
  | "READY" // dependencies satisfied, queued for execution
  | "RUNNING"
  | "AWAITING_APPROVAL"
  | "COMPLETED"
  | "FAILED"
  | "BLOCKED" // a dependency failed or was cancelled
  | "CANCELLED";

export interface MissionTask {
  id: string;
  missionId: string;
  title: string;
  description: string;
  agent: AgentId;
  /** Tool names this task may use — always a subset of the assigned
   * agent's allowedTools (enforced by planValidator). */
  tools: string[];
  /** MissionTask ids that must reach COMPLETED before this one becomes READY. */
  dependencies: string[];
  status: MissionTaskStatus;
  priority: "low" | "medium" | "high";
  /** The objective text fed to the ReasoningEngine for this task. */
  input: string;
  /** Final synthesized result text once COMPLETED. */
  output?: string;
  error?: string;
  retryCount: number;
  toolCallCount: number;
  startedAt: number | null;
  completedAt: number | null;
}

export type MissionStatus =
  | "DRAFT" // plan proposed, not yet authorized
  | "QUEUED"
  | "RUNNING"
  | "AWAITING_APPROVAL"
  | "PAUSED"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";

export interface MissionBudget {
  maxIterations: number;
  maxToolCalls: number;
  maxAgents: number;
  maxTasks: number;
  maxRuntimeMs: number;
  maxModelCalls: number;
  maxRetries: number;
}

export const DEFAULT_MISSION_BUDGET: MissionBudget = {
  maxIterations: 5,
  maxToolCalls: 10,
  maxAgents: 8,
  maxTasks: 12,
  maxRuntimeMs: 5 * 60_000,
  maxModelCalls: 30,
  maxRetries: 2,
};

export interface Mission {
  id: string;
  sessionId: string;
  objective: string;
  status: MissionStatus;
  tasks: MissionTask[];
  autonomyLevel: AutonomyLevel;
  budget: MissionBudget;
  /** Honesty label — was this plan produced by a real LLM call or the
   * deterministic heuristic fallback (no provider configured / the model
   * didn't return a parseable plan)? Never hidden from the UI. */
  planSource: "llm" | "heuristic";
  createdAt: number;
  updatedAt: number;
  startedAt: number | null;
  completedAt: number | null;
  estimatedSteps: number;
  completedSteps: number;
  failureCount: number;
  modelCallCount: number;
  toolCallCount: number;
  retryCount: number;
  /** Final natural-language synthesis once COMPLETED (or a partial-result
   * note when stopped early). */
  synthesis?: string;
  error?: string;
}
