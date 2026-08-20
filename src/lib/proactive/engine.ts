import type { JarvisTask } from "@/types/tasks";
import type { NotificationType } from "@/lib/events/bus";

export interface ProactiveNotification {
  key: string;
  type: NotificationType;
  title: string;
  message: string;
}

export interface ProactiveCheckInput {
  diagnosticsScore: number;
  threatLevel: number;
  tasks: JarvisTask[];
  memoryRecordCount: number;
  now: number;
  alreadyNotified: ReadonlySet<string>;
}

export interface ProactiveCheckResult {
  notifications: ProactiveNotification[];
  add: string[];
  remove: string[];
}

const TASK_DUE_SOON_MS = 15 * 60_000;
const MEMORY_HIGH_WATERMARK = 400;
const MEMORY_LOW_WATERMARK = 300;

/**
 * Pure condition-evaluation core of the proactive engine — no timers, no
 * event bus, no store access, so it's trivial to unit test. The
 * useProactiveEngine hook is a thin wrapper that calls this on an
 * interval and on relevant events, then actually emits the resulting
 * notifications and updates its own "already notified" set from
 * add/remove.
 */
export function evaluateProactiveConditions(input: ProactiveCheckInput): ProactiveCheckResult {
  const notifications: ProactiveNotification[] = [];
  const add: string[] = [];
  const remove: string[] = [];

  if (input.diagnosticsScore < 80 && !input.alreadyNotified.has("diagnostics-degraded")) {
    add.push("diagnostics-degraded");
    notifications.push({
      key: "diagnostics-degraded",
      type: "warning",
      title: "Diagnostics",
      message: `System diagnostics detected degraded performance (${input.diagnosticsScore}%). Consider running a full diagnostic pass.`,
    });
  }
  if (input.diagnosticsScore >= 90) remove.push("diagnostics-degraded");

  if (input.threatLevel > 60 && !input.alreadyNotified.has("threat-elevated")) {
    add.push("threat-elevated");
    notifications.push({
      key: "threat-elevated",
      type: "warning",
      title: "Tactical",
      message: `Threat level elevated (${Math.round(input.threatLevel)}%). Review the tactical radar.`,
    });
  }
  if (input.threatLevel < 30) remove.push("threat-elevated");

  for (const task of input.tasks) {
    if (task.status !== "PENDING" && task.status !== "RUNNING") continue;
    if (!task.dueAt) continue;
    const key = `task-due-${task.id}`;
    const msUntilDue = task.dueAt - input.now;
    if (msUntilDue > 0 && msUntilDue <= TASK_DUE_SOON_MS && !input.alreadyNotified.has(key)) {
      add.push(key);
      notifications.push({ key, type: "info", title: "Task", message: `"${task.title}" is due soon.` });
    }
  }

  if (input.memoryRecordCount > MEMORY_HIGH_WATERMARK && !input.alreadyNotified.has("memory-optimize")) {
    add.push("memory-optimize");
    notifications.push({
      key: "memory-optimize",
      type: "info",
      title: "Memory",
      message: "Memory record count is getting large — an optimization pass is recommended.",
    });
  }
  if (input.memoryRecordCount <= MEMORY_LOW_WATERMARK) remove.push("memory-optimize");

  return { notifications, add, remove };
}
