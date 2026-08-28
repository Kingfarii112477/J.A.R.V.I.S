import type { MissionTask, MissionTaskStatus } from "@/lib/planning/planTypes";
import type { AgentId } from "@/lib/agents/types";
import { generateId } from "@/lib/utils/id";

/** Pure MissionTask constructors/transitions — no store, no I/O. The
 * orchestrator and planner both build/mutate MissionTask objects through
 * these so every transition stays consistent (status + timestamps always
 * move together) and is trivial to unit test in isolation. */

export function createMissionTask(input: {
  missionId: string;
  title: string;
  description: string;
  agent: AgentId;
  tools: string[];
  dependencies: string[];
  priority?: "low" | "medium" | "high";
  input: string;
}): MissionTask {
  return {
    id: generateId("mtask"),
    missionId: input.missionId,
    title: input.title,
    description: input.description,
    agent: input.agent,
    tools: input.tools,
    dependencies: input.dependencies,
    status: "PENDING",
    priority: input.priority ?? "medium",
    input: input.input,
    retryCount: 0,
    toolCallCount: 0,
    startedAt: null,
    completedAt: null,
  };
}

function withStatus(task: MissionTask, status: MissionTaskStatus, patch: Partial<MissionTask> = {}): MissionTask {
  return { ...task, status, ...patch };
}

export const taskManager = {
  markReady: (task: MissionTask) => withStatus(task, "READY"),
  markRunning: (task: MissionTask) => withStatus(task, "RUNNING", { startedAt: Date.now() }),
  markAwaitingApproval: (task: MissionTask) => withStatus(task, "AWAITING_APPROVAL"),
  markCompleted: (task: MissionTask, output: string, toolCallCount: number) =>
    withStatus(task, "COMPLETED", { output, toolCallCount, completedAt: Date.now() }),
  markFailed: (task: MissionTask, error: string) => withStatus(task, "FAILED", { error, completedAt: Date.now() }),
  markBlocked: (task: MissionTask, reason: string) => withStatus(task, "BLOCKED", { error: reason, completedAt: Date.now() }),
  markCancelled: (task: MissionTask) => withStatus(task, "CANCELLED", { completedAt: Date.now() }),
  incrementRetry: (task: MissionTask) => ({ ...task, retryCount: task.retryCount + 1, status: "PENDING" as MissionTaskStatus, error: undefined }),
};
