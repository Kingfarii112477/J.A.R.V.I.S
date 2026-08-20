"use client";

import { useEffect, useRef } from "react";
import { useJarvisStore } from "@/store/jarvisStore";
import { eventBus } from "@/lib/events/bus";
import { logAuditEvent } from "@/lib/security/auditLog";

const ACTIVITY_EVENTS = ["mousemove", "keydown", "touchstart", "click", "scroll"] as const;
const POLL_INTERVAL_MS = 5000;

/** Enforces settings.sessionTimeoutMinutes for real when
 * settings.lockScreenEnabled is on — tracks the last user-activity
 * timestamp across mouse/keyboard/touch/scroll events and locks the
 * screen once that many minutes pass with no activity. A no-op entirely
 * when lock screen is disabled (the default). */
export function useSessionIdleTimer() {
  const lockScreenEnabled = useJarvisStore((s) => s.settings.lockScreenEnabled);
  const timeoutMinutes = useJarvisStore((s) => s.settings.sessionTimeoutMinutes);
  const lastActivityRef = useRef(Date.now());

  useEffect(() => {
    if (!lockScreenEnabled) return;

    function markActivity() {
      lastActivityRef.current = Date.now();
    }
    lastActivityRef.current = Date.now();
    for (const eventName of ACTIVITY_EVENTS) {
      window.addEventListener(eventName, markActivity, { passive: true });
    }

    const interval = setInterval(() => {
      if (useJarvisStore.getState().locked) return;
      const idleMs = Date.now() - lastActivityRef.current;
      if (idleMs >= timeoutMinutes * 60_000) {
        useJarvisStore.getState().setLocked(true);
        eventBus.emit("security.locked", { reason: "idle-timeout" });
        logAuditEvent({ type: "AUTHENTICATION", source: "system", result: "success", detail: "auto-lock: idle timeout" });
      }
    }, POLL_INTERVAL_MS);

    return () => {
      for (const eventName of ACTIVITY_EVENTS) {
        window.removeEventListener(eventName, markActivity);
      }
      clearInterval(interval);
    };
  }, [lockScreenEnabled, timeoutMinutes]);
}
