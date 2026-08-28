import type { Mission, MissionTask } from "@/lib/planning/planTypes";
import type { MissionExecutionContext } from "@/lib/execution/executionContext";
import { nextBatch } from "@/lib/tasks/taskQueue";
import { getNewlyBlockedTasks, isMissionComplete } from "@/lib/planning/taskGraph";
import { taskManager } from "@/lib/tasks/taskManager";
import { decideRecoveryAction } from "@/lib/execution/failureRecovery";
import { retryDelayMs } from "@/lib/execution/retryPolicy";
import { attemptReplan } from "@/lib/planning/replanner";
import { executeMissionTask } from "./coordinator";
import { storeMissionMemory } from "./missionMemory";
import { eventBus } from "@/lib/events/bus";

export interface MissionControlFlags {
  paused: boolean;
  cancelled: boolean;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function replaceTask(tasks: MissionTask[], updated: MissionTask): MissionTask[] {
  return tasks.map((t) => (t.id === updated.id ? updated : t));
}

/**
 * Drives one mission's tasks to completion (or to a paused/cancelled/
 * budget-exceeded stop) — dependency-aware, concurrency-capped, and
 * genuinely resumable: PAUSE simply stops scheduling new batches (any
 * already-dispatched batch is left to finish naturally rather than
 * force-killed), and RESUME is nothing more than calling this function
 * again over the same mutable task list — completed tasks never
 * re-execute, so there's no risk of "restarting blindly."
 *
 * Mutates `mission` in place (tasks/status/counters) so the caller
 * (AutonomousOrchestrator) can persist it via MissionStore after every
 * tick without this function needing to know about persistence itself.
 */
export async function runExecutionLoop(
  mission: Mission,
  ctx: MissionExecutionContext,
  flags: MissionControlFlags,
  /** Fired after each batch settles — the orchestrator uses this to
   * persist progress incrementally (best-effort), so a browser refresh
   * mid-mission loses at most one in-flight batch, not the whole run. */
  onTick?: () => void
): Promise<void> {
  const startedAt = mission.startedAt ?? Date.now();

  while (true) {
    // Every branch below persists (onTick) BEFORE emitting its event —
    // useMissions() and friends refetch from MissionStore the instant
    // they hear one of these events, and each of these is a `return`
    // (no later event will ever arrive to self-correct a stale read).
    if (flags.cancelled) {
      mission.status = "CANCELLED";
      onTick?.();
      eventBus.emit("mission.cancelled", { missionId: mission.id });
      return;
    }
    if (flags.paused) {
      mission.status = "PAUSED";
      onTick?.();
      eventBus.emit("mission.paused", { missionId: mission.id });
      return;
    }

    // Budget enforcement — a runaway mission pauses with a clear reason
    // rather than looping forever.
    if (Date.now() - startedAt > mission.budget.maxRuntimeMs) {
      mission.status = "PAUSED";
      mission.error = `Mission paused — exceeded the maximum runtime budget (${Math.round(mission.budget.maxRuntimeMs / 1000)}s).`;
      onTick?.();
      eventBus.emit("mission.paused", { missionId: mission.id });
      return;
    }
    if (mission.toolCallCount > mission.budget.maxToolCalls) {
      mission.status = "PAUSED";
      mission.error = `Mission paused — exceeded the maximum tool-call budget (${mission.budget.maxToolCalls}).`;
      onTick?.();
      eventBus.emit("mission.paused", { missionId: mission.id });
      return;
    }

    // Propagate failures to anything that can never run because of them.
    const newlyBlocked = getNewlyBlockedTasks(mission.tasks);
    for (const blocked of newlyBlocked) {
      mission.tasks = replaceTask(mission.tasks, taskManager.markBlocked(blocked, "A dependency failed or was cancelled."));
      eventBus.emit("mission.task.blocked", { missionId: mission.id, taskId: blocked.id, reason: "dependency_failed" });
    }

    if (isMissionComplete(mission.tasks)) {
      const synthesisFailed = mission.tasks.some((t) => t.status === "FAILED" || t.status === "BLOCKED");
      mission.status = synthesisFailed && mission.tasks.every((t) => t.status !== "COMPLETED") ? "FAILED" : "COMPLETED";
      const synthesisTask = [...mission.tasks].reverse().find((t) => t.status === "COMPLETED");
      mission.synthesis = synthesisTask?.output ?? mission.synthesis;
      mission.completedAt = Date.now();
      mission.completedSteps = mission.tasks.filter((t) => t.status === "COMPLETED").length;
      const latencyMs = mission.completedAt - startedAt;
      if (mission.status === "COMPLETED") {
        onTick?.();
        eventBus.emit("mission.completed", { missionId: mission.id, latencyMs, completedSteps: mission.completedSteps });
        void storeMissionMemory(mission);
      } else {
        mission.error = mission.error ?? "Every task failed or was blocked before the mission could produce a result.";
        onTick?.();
        eventBus.emit("mission.failed", { missionId: mission.id, reason: mission.error });
      }
      return;
    }

    const batch = nextBatch(mission.tasks, 3);
    if (batch.length === 0) {
      // Nothing ready, nothing newly blocked this tick, and the mission
      // isn't complete — a genuine stall (shouldn't happen for a
      // validated DAG, but never spin forever if it somehow does).
      mission.status = "FAILED";
      mission.error = "Mission stalled — no task is ready to run and the mission is not complete.";
      onTick?.();
      eventBus.emit("mission.failed", { missionId: mission.id, reason: mission.error });
      return;
    }

    mission.tasks = mission.tasks.map((t) => {
      const running = batch.find((b) => b.id === t.id);
      return running ? taskManager.markRunning(t) : t;
    });
    // Persist before announcing — useMissions()/useMissionPendingApproval
    // refetch from MissionStore the moment they hear mission.task.started,
    // so the store must already reflect these tasks as RUNNING or that
    // refresh reads the mission's still-DRAFT/previous-batch snapshot.
    onTick?.();
    for (const task of batch) {
      eventBus.emit("mission.task.started", { missionId: mission.id, taskId: task.id, agent: task.agent });
    }

    const results = await Promise.all(batch.map((task) => executeMissionTask(mission, task, ctx)));

    for (let i = 0; i < batch.length; i++) {
      const task = mission.tasks.find((t) => t.id === batch[i].id)!;
      const result = results[i];
      mission.modelCallCount += result.iterations;
      mission.toolCallCount += result.toolCallCount;

      if (result.ok) {
        mission.tasks = replaceTask(mission.tasks, taskManager.markCompleted(task, result.output ?? "", result.toolCallCount));
        // Keep completedSteps live as each task finishes — it previously
        // only got recomputed once the whole mission reached its terminal
        // isMissionComplete() check, so the UI's progress readout ("X/Y
        // STEPS COMPLETE") stayed stuck at 0 for the mission's entire
        // running duration.
        mission.completedSteps = mission.tasks.filter((t) => t.status === "COMPLETED").length;
        eventBus.emit("mission.task.completed", { missionId: mission.id, taskId: task.id, agent: task.agent, latencyMs: result.latencyMs });
        continue;
      }

      if (result.error === "Cancelled.") {
        mission.tasks = replaceTask(mission.tasks, taskManager.markCancelled(task));
        continue;
      }

      const category = result.failureCategory ?? "UNKNOWN";
      const action = decideRecoveryAction(category, task.retryCount, mission.budget.maxRetries);

      if (action === "RETRY") {
        mission.retryCount += 1;
        eventBus.emit("mission.task.failed", { missionId: mission.id, taskId: task.id, agent: task.agent, error: result.error ?? "Unknown error.", category });
        await sleep(retryDelayMs(task.retryCount));
        mission.tasks = replaceTask(mission.tasks, taskManager.incrementRetry(task));
        continue;
      }

      if (action === "PAUSE_FOR_APPROVAL") {
        mission.tasks = replaceTask(mission.tasks, taskManager.markAwaitingApproval(task));
        mission.status = "AWAITING_APPROVAL";
        onTick?.();
        eventBus.emit("mission.task.failed", { missionId: mission.id, taskId: task.id, agent: task.agent, error: result.error ?? "Permission required.", category });
        return;
      }

      // FAIL — permanent failure. Mark it, then see whether the rest of
      // the plan can still proceed without it.
      mission.failureCount += 1;
      mission.tasks = replaceTask(mission.tasks, taskManager.markFailed(task, result.error ?? "Task failed."));
      eventBus.emit("mission.task.failed", { missionId: mission.id, taskId: task.id, agent: task.agent, error: result.error ?? "Task failed.", category });

      const replan = attemptReplan(mission, task.id);
      if (replan.replanned) {
        mission.tasks = replan.mission.tasks;
        mission.updatedAt = Date.now();
        eventBus.emit("plan.replanned", { missionId: mission.id, note: replan.note });
      }
    }

    onTick?.();
  }
}
