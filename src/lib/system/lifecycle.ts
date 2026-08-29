import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";

/**
 * Cold start vs. warm start vs. background/foreground, handled honestly:
 * this only ever reacts to real transitions Capacitor/the browser report
 * (Activity onResume/onPause on Android, document.visibilitychange on the
 * web) — it never simulates or assumes a lifecycle event. A "cold start"
 * is simply the first mount (nothing to subscribe to for that, callers
 * already run their init logic on mount); this module is specifically
 * for the warm-start case — the app coming back to the foreground after
 * Android backgrounded or suspended it — and for reacting when it's
 * pushed to the background.
 */
export function subscribeAppLifecycle(handlers: { onForeground?: () => void; onBackground?: () => void }): () => void {
  if (Capacitor.isNativePlatform()) {
    let cancelled = false;
    const removers: (() => void)[] = [];
    App.addListener("resume", () => handlers.onForeground?.())
      .then((h) => {
        if (cancelled) h.remove();
        else removers.push(() => h.remove());
      })
      .catch(() => {});
    App.addListener("pause", () => handlers.onBackground?.())
      .then((h) => {
        if (cancelled) h.remove();
        else removers.push(() => h.remove());
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      removers.forEach((remove) => remove());
    };
  }

  if (typeof document === "undefined") return () => {};
  const onVisibilityChange = () => {
    if (document.hidden) {
      handlers.onBackground?.();
    } else {
      handlers.onForeground?.();
    }
  };
  document.addEventListener("visibilitychange", onVisibilityChange);
  return () => document.removeEventListener("visibilitychange", onVisibilityChange);
}
