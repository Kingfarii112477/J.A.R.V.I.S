"use client";

import { useEventListener } from "@/hooks/useEventListener";
import { useJarvisStore } from "@/store/jarvisStore";

/** Bridges lib/events/bus.ts's "notification.push" events into the
 * existing toast/notification UI, so any subsystem (proactive engine,
 * tool executor, automation) can surface a HUD alert just by emitting an
 * event — it doesn't need to know the store exists. */
export function useNotificationBridge() {
  const pushToast = useJarvisStore((s) => s.pushToast);
  const notificationsEnabled = useJarvisStore((s) => s.settings.notificationsEnabled);

  useEventListener("notification.push", (payload) => {
    if (!notificationsEnabled) return;
    pushToast(payload.message ?? payload.title, payload.type, payload.message ? payload.title : undefined);
  });
}
