import { Capacitor } from "@capacitor/core";
import { Network } from "@capacitor/network";

/**
 * True network reachability. Prefers the native Capacitor Network plugin
 * (accurate on Android even inside a WebView, where navigator.onLine can
 * lag behind or misreport captive-portal-style connections) and falls
 * back to the browser's navigator.onLine everywhere else — the same
 * signal the web deployment has always had available.
 */
export async function getNetworkOnline(): Promise<boolean> {
  if (Capacitor.isNativePlatform()) {
    try {
      const status = await Network.getStatus();
      return status.connected;
    } catch {
      // A plugin call failing native-side is itself a connectivity-adjacent
      // problem; navigator.onLine is the best remaining honest guess.
      return typeof navigator !== "undefined" ? navigator.onLine : true;
    }
  }
  return typeof navigator !== "undefined" ? navigator.onLine : true;
}

/**
 * Subscribes to live connectivity changes. Returns an unsubscribe
 * function that is always safe to call, even before the native listener
 * handle has resolved.
 */
export function subscribeNetworkStatus(onChange: (online: boolean) => void): () => void {
  if (Capacitor.isNativePlatform()) {
    let cancelled = false;
    let handle: { remove: () => void } | null = null;
    Network.addListener("networkStatusChange", (status) => onChange(status.connected))
      .then((h) => {
        if (cancelled) {
          h.remove();
        } else {
          handle = h;
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      handle?.remove();
    };
  }

  if (typeof window === "undefined") return () => {};
  const onOnline = () => onChange(true);
  const onOffline = () => onChange(false);
  window.addEventListener("online", onOnline);
  window.addEventListener("offline", onOffline);
  return () => {
    window.removeEventListener("online", onOnline);
    window.removeEventListener("offline", onOffline);
  };
}
