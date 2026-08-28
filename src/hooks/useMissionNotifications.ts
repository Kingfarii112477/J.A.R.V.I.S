"use client";

import { useEventListener } from "@/hooks/useEventListener";
import { orchestrator } from "@/lib/orchestration/orchestrator";
import { eventBus } from "@/lib/events/bus";
import { generateId } from "@/lib/utils/id";

/**
 * Mission completion/failure notifications, mounted once globally
 * (alongside useNotificationBridge in JarvisShell) so they surface
 * regardless of which screen the user is currently on — reuses the
 * exact same notification.push -> toast pipeline every other subsystem
 * already uses, rather than a separate mission-specific alert UI.
 *
 * Deliberately narrow: only mission-terminal events notify (completed/
 * failed/budget-paused), not every intermediate task step — a pending
 * approval or task progress is already visible via the mission card and
 * the core's WARNING/PROCESSING pulse, so a toast for those would just
 * be noise on top of an already-visible cue.
 */
export function useMissionNotifications() {
  useEventListener("mission.completed", async (payload) => {
    const mission = await orchestrator.getMission(payload.missionId);
    eventBus.emit("notification.push", {
      id: generateId("notif"),
      type: "success",
      title: "MISSION COMPLETE",
      message: mission?.objective ?? "A mission finished successfully.",
    });
  });

  useEventListener("mission.failed", async (payload) => {
    const mission = await orchestrator.getMission(payload.missionId);
    eventBus.emit("notification.push", {
      id: generateId("notif"),
      type: "error",
      title: "MISSION FAILED",
      message: mission ? `${mission.objective} — ${payload.reason}` : payload.reason,
    });
  });

  useEventListener("mission.paused", async (payload) => {
    const mission = await orchestrator.getMission(payload.missionId);
    if (!mission?.error) return; // a user-initiated pause needs no alert — only a budget/limit pause does
    eventBus.emit("notification.push", {
      id: generateId("notif"),
      type: "warning",
      title: "MISSION PAUSED",
      message: mission.error,
    });
  });
}
