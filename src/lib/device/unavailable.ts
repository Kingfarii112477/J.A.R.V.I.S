import type { DeviceCapabilityProvider } from "./types";

const NOT_AVAILABLE = "Device capability bridge is only available inside the native J.A.R.V.I.S Android app.";

/** The honest fallback for every context that isn't the native Android
 * shell — a normal browser tab, this Netlify deployment loaded directly,
 * or a WebView without the plugin registered. Every method reports
 * failure with a clear reason; nothing here ever pretends a device
 * action happened. */
export const unavailableDeviceProvider: DeviceCapabilityProvider = {
  id: "unavailable",
  isAvailable: () => false,
  isAppAvailable: async () => false,
  launchApp: async (packageName) => ({ launched: false, packageName, reason: NOT_AVAILABLE }),
  openUrl: async (url) => ({ opened: false, url, usedApp: false, reason: NOT_AVAILABLE }),
  mediaControl: async (action) => ({ ok: false, action, reason: NOT_AVAILABLE }),
  getDeviceStatus: async () => ({
    batteryLevel: null,
    isCharging: null,
    isOnline: typeof navigator !== "undefined" ? navigator.onLine : true,
    networkType: "unknown",
    wifiEnabled: null,
    bluetoothEnabled: null,
    deviceModel: null,
    androidVersion: null,
    storageAvailableBytes: null,
    storageTotalBytes: null,
  }),
  requestNotificationPermission: async () => ({ granted: false, reason: NOT_AVAILABLE }),
  postNotification: async () => ({ posted: false, reason: NOT_AVAILABLE }),
  // No Activity to launch an intent from off-device.
  openAppSettings: async () => ({ opened: false as const, reason: "Only available in the Android app." }),
  getLastExitInfo: async () => ({ available: false }),
};
