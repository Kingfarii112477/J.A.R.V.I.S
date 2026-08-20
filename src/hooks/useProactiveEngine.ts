"use client";

import { useEffect, useRef } from "react";
import { useJarvisStore } from "@/store/jarvisStore";
import { eventBus } from "@/lib/events/bus";
import { generateId } from "@/lib/utils/id";
import { memoryClient } from "@/lib/memory/client";
import { useEventListener } from "@/hooks/useEventListener";
import { evaluateProactiveConditions } from "@/lib/proactive/engine";

const CHECK_INTERVAL_MS = 45_000;

/**
 * Thin wrapper around lib/proactive/engine.ts's pure condition checker:
 * gathers current state, runs the check, emits any resulting
 * notifications on the event bus, and updates the "already notified" set
 * so the same condition doesn't re-fire every interval. Every
 * notification here is transparent (states exactly what triggered it),
 * dismissible (routes through the normal toast stack), and fully gated
 * behind settings.proactiveSuggestions.
 */
export function useProactiveEngine() {
  const enabled = useJarvisStore((s) => s.settings.proactiveSuggestions);
  const notifiedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!enabled) return;

    async function evaluate() {
      const store = useJarvisStore.getState();
      let memoryRecordCount = 0;
      try {
        memoryRecordCount = (await memoryClient.stats()).total;
      } catch {
        // Memory provider unreachable — proceed without that signal.
      }

      const { notifications, add, remove } = evaluateProactiveConditions({
        diagnosticsScore: store.diagnosticsScore,
        threatLevel: store.telemetry.threatLevel,
        tasks: store.tasks,
        memoryRecordCount,
        now: Date.now(),
        alreadyNotified: notifiedRef.current,
      });

      for (const key of add) notifiedRef.current.add(key);
      for (const key of remove) notifiedRef.current.delete(key);

      for (const n of notifications) {
        eventBus.emit("notification.push", { id: generateId("notif"), type: n.type, title: n.title, message: n.message });
      }
    }

    void evaluate();
    const interval = setInterval(() => void evaluate(), CHECK_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [enabled]);

  useEventListener("automation.completed", (payload) => {
    if (payload.success || !enabled) return;
    eventBus.emit("notification.push", {
      id: generateId("notif"),
      type: "error",
      title: "Automation",
      message: `Workflow "${payload.workflowId}" failed to complete.`,
    });
  });
}
