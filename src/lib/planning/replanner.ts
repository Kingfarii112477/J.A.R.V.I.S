import type { Mission } from "./planTypes";

export interface ReplanOutcome {
  mission: Mission;
  replanned: boolean;
  note: string;
}

/**
 * Recognizes "the original plan is no longer valid" for one permanently
 * failed task (retries already exhausted — see failureRecovery.ts) and
 * revises the plan rather than failing the whole mission outright.
 *
 * This implementation's replanning strategy is deliberately scoped to
 * "can dependencies be rearranged / can the task be removed" from the
 * spec's list — the concrete, mechanically verifiable moves available
 * without a second LLM call: if nothing depended on the failed task, the
 * rest of the mission is unaffected and nothing needs to change; if
 * something did, that dependency is dropped so downstream tasks can
 * still run, each annotated so it never silently assumes the failed step
 * succeeded. "Try another tool/source" isn't attempted automatically —
 * each agent's tool list is intentionally small (see specialistAgents.ts),
 * so a genuine alternative rarely exists; that case surfaces to the user
 * as a partial-completion note instead of a fabricated substitution.
 */
export function attemptReplan(mission: Mission, failedTaskId: string): ReplanOutcome {
  const failedTask = mission.tasks.find((t) => t.id === failedTaskId);
  if (!failedTask) {
    return { mission, replanned: false, note: `No task "${failedTaskId}" in this mission.` };
  }
  if (failedTask.status !== "FAILED") {
    return { mission, replanned: false, note: `"${failedTask.title}" is not in a failed state — nothing to replan.` };
  }

  const dependents = mission.tasks.filter((t) => t.dependencies.includes(failedTaskId));
  if (dependents.length === 0) {
    return { mission, replanned: false, note: `"${failedTask.title}" failed but nothing depended on it — the rest of the mission proceeds unaffected.` };
  }

  const revisedTasks = mission.tasks.map((t) => {
    if (!t.dependencies.includes(failedTaskId)) return t;
    return {
      ...t,
      dependencies: t.dependencies.filter((d) => d !== failedTaskId),
      input: `${t.input}\n\nNote: the "${failedTask.title}" step failed and was skipped — do not claim it succeeded or reference results from it.`,
    };
  });

  return {
    mission: { ...mission, tasks: revisedTasks, updatedAt: Date.now() },
    replanned: true,
    note: `Revised plan: "${failedTask.title}" failed — ${dependents.length} dependent task${dependents.length === 1 ? "" : "s"} will proceed without it.`,
  };
}
