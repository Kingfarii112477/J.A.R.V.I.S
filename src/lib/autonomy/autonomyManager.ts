"use client";

import { useJarvisStore } from "@/store/jarvisStore";
import { eventBus } from "@/lib/events/bus";
import type { AutonomyLevel } from "./autonomyLevels";

/** Reads/writes the session's autonomy level — persisted as
 * settings.autonomyLevel (see jarvisStore.ts), the same mechanism every
 * other user-facing preference already uses. This is the ONLY function
 * in the codebase allowed to change it — never call
 * useJarvisStore.getState().updateSettings({autonomyLevel}) directly, and
 * never call this from anywhere except an explicit user action (a
 * Settings/Autonomy Center control). Autonomy must never increase
 * silently as a side effect of anything else. */
export function getAutonomyLevel(): AutonomyLevel {
  return useJarvisStore.getState().settings.autonomyLevel;
}

export function setAutonomyLevel(level: AutonomyLevel) {
  const previous = getAutonomyLevel();
  if (previous === level) return;
  useJarvisStore.getState().updateSettings({ autonomyLevel: level });
  eventBus.emit("autonomy.changed", { previousLevel: previous, level });
}
