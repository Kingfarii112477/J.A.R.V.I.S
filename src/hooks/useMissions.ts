"use client";

import { useEffect, useState } from "react";
import { useEventListener } from "@/hooks/useEventListener";
import { orchestrator } from "@/lib/orchestration/orchestrator";
import type { Mission } from "@/lib/planning/planTypes";

/** Live list of every mission the local MissionStore knows about,
 * newest first — refetched whenever any mission-scoped event fires.
 * Simple polling-on-event rather than a store subscription, since
 * MissionStore (like MemoryProvider) is an async I/O boundary, not
 * synchronous state. */
export function useMissions(): Mission[] {
  const [missions, setMissions] = useState<Mission[]>([]);

  async function refresh() {
    setMissions(await orchestrator.listMissions());
  }

  useEffect(() => {
    void refresh();
  }, []);

  useEventListener("mission.created", () => void refresh());
  useEventListener("mission.started", () => void refresh());
  useEventListener("mission.completed", () => void refresh());
  useEventListener("mission.failed", () => void refresh());
  useEventListener("mission.paused", () => void refresh());
  useEventListener("mission.resumed", () => void refresh());
  useEventListener("mission.cancelled", () => void refresh());
  useEventListener("mission.task.started", () => void refresh());
  useEventListener("mission.task.completed", () => void refresh());
  useEventListener("mission.task.failed", () => void refresh());
  useEventListener("plan.replanned", () => void refresh());

  return missions;
}
