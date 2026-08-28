import type { MissionTask } from "./planTypes";

/**
 * Pure dependency-graph operations over a Mission's task list — no I/O,
 * no store access, so the orchestrator's dependency-aware scheduling and
 * planValidator's cycle check both stay trivially testable. Doubles as
 * this project's "dependencyResolver": cycle detection and ready-task
 * detection are two views of the same DAG, not two separate concerns.
 */

/** DFS-based cycle detection. Returns the ids forming a cycle (empty if
 * the graph is a valid DAG) — undefined dependency ids are not cycles by
 * themselves (planValidator reports those separately as dangling refs). */
export function detectCycle(tasks: MissionTask[]): string[] {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const WHITE = 0,
    GRAY = 1,
    BLACK = 2;
  const color = new Map<string, number>(tasks.map((t) => [t.id, WHITE]));
  const stack: string[] = [];

  function visit(id: string): string[] | null {
    color.set(id, GRAY);
    stack.push(id);
    const task = byId.get(id);
    for (const depId of task?.dependencies ?? []) {
      if (!byId.has(depId)) continue; // dangling ref — not this function's concern
      const c = color.get(depId);
      if (c === GRAY) {
        const cycleStart = stack.indexOf(depId);
        return [...stack.slice(cycleStart), depId];
      }
      if (c === WHITE) {
        const found = visit(depId);
        if (found) return found;
      }
    }
    stack.pop();
    color.set(id, BLACK);
    return null;
  }

  for (const task of tasks) {
    if (color.get(task.id) === WHITE) {
      const cycle = visit(task.id);
      if (cycle) return cycle;
    }
  }
  return [];
}

/** Every dependency id that doesn't reference a real task in this plan. */
export function danglingDependencies(tasks: MissionTask[]): { taskId: string; missingDependency: string }[] {
  const ids = new Set(tasks.map((t) => t.id));
  const missing: { taskId: string; missingDependency: string }[] = [];
  for (const task of tasks) {
    for (const dep of task.dependencies) {
      if (!ids.has(dep)) missing.push({ taskId: task.id, missingDependency: dep });
    }
  }
  return missing;
}

/** Tasks whose dependencies are all COMPLETED and are themselves still
 * PENDING — the set the scheduler may promote to READY this tick.
 * Independent tasks (no shared dependency) surface together, letting the
 * orchestrator run them concurrently; a task with an incomplete
 * dependency never appears here. */
export function getReadyTasks(tasks: MissionTask[]): MissionTask[] {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  return tasks.filter((t) => {
    if (t.status !== "PENDING") return false;
    return t.dependencies.every((depId) => byId.get(depId)?.status === "COMPLETED");
  });
}

/** Tasks that can never run because a dependency FAILED or was
 * CANCELLED — propagates transitively (a task blocked by a blocked task
 * is also blocked). */
export function getNewlyBlockedTasks(tasks: MissionTask[]): MissionTask[] {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const terminalBad = new Set(["FAILED", "CANCELLED", "BLOCKED"]);
  const blocked: MissionTask[] = [];
  // Fixed-point over the (small, per-mission) task list so transitive
  // blocking propagates without needing a second pass from the caller.
  let changed = true;
  const blockedIds = new Set<string>();
  while (changed) {
    changed = false;
    for (const t of tasks) {
      if (t.status !== "PENDING" && t.status !== "READY") continue;
      if (blockedIds.has(t.id)) continue;
      const hasBadDep = t.dependencies.some((depId) => {
        const dep = byId.get(depId);
        return dep && (terminalBad.has(dep.status) || blockedIds.has(depId));
      });
      if (hasBadDep) {
        blockedIds.add(t.id);
        blocked.push(t);
        changed = true;
      }
    }
  }
  return blocked;
}

export function isMissionComplete(tasks: MissionTask[]): boolean {
  return tasks.every((t) => t.status === "COMPLETED" || t.status === "CANCELLED" || t.status === "BLOCKED");
}

export function hasFailedTask(tasks: MissionTask[]): boolean {
  return tasks.some((t) => t.status === "FAILED");
}
