import { registerPlugin } from "@capacitor/core";
import type { AppLaunchResult, DeepLinkResult, DeviceCapabilityProvider, DeviceStatus, MediaAction, MediaControlResult, NotificationResult, PermissionResult, LastExitInfo } from "./types";

/**
 * The raw JS-facing shape of the native Kotlin plugin (see
 * android/app/src/main/java/com/jarvis/aios/DeviceCapabilityPlugin.kt).
 * registerPlugin() resolves this against whatever native implementation
 * Capacitor finds at runtime — inside the Android app, that's the real
 * plugin; anywhere else (a plain browser), calling any method on it
 * throws, which is exactly why manager.ts never hands this out unless
 * Capacitor.isNativePlatform() is true.
 */
interface DeviceCapabilityPluginInterface {
  isAppAvailable(options: { packageName: string }): Promise<{ available: boolean }>;
  launchApp(options: { packageName: string }): Promise<{ launched: boolean; reason?: string }>;
  openUrl(options: { url: string }): Promise<{ opened: boolean; usedApp: boolean; reason?: string }>;
  mediaControl(options: { action: MediaAction }): Promise<{ ok: boolean; reason?: string }>;
  getDeviceStatus(): Promise<DeviceStatus>;
  requestNotificationPermission(): Promise<{ granted: boolean; reason?: string }>;
  postNotification(options: { title: string; body: string }): Promise<{ posted: boolean; reason?: string }>;
  openAppSettings(): Promise<{ opened: boolean; reason?: string }>;
  getLastExitInfo(): Promise<LastExitInfo>;
}

const DeviceCapability = registerPlugin<DeviceCapabilityPluginInterface>("DeviceCapability");

/** Wraps every plugin call in try/catch — a plugin method throwing
 * (bridge unavailable mid-call, an unexpected native exception) becomes
 * an honest {ok:false, reason} result for the caller rather than an
 * unhandled rejection bubbling into the reasoning engine. */
async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    return { ...fallback, reason: err instanceof Error ? err.message : "Native device bridge call failed." };
  }
}

export const nativeDeviceProvider: DeviceCapabilityProvider = {
  id: "native",
  isAvailable: () => true,

  isAppAvailable: async (packageName) => {
    try {
      const { available } = await DeviceCapability.isAppAvailable({ packageName });
      return available;
    } catch {
      return false;
    }
  },

  launchApp: async (packageName): Promise<AppLaunchResult> => {
    const result = await safe(() => DeviceCapability.launchApp({ packageName }), { launched: false, reason: undefined });
    return { launched: result.launched, packageName, reason: result.reason };
  },

  openUrl: async (url): Promise<DeepLinkResult> => {
    const result = await safe(() => DeviceCapability.openUrl({ url }), { opened: false, usedApp: false, reason: undefined });
    return { opened: result.opened, url, usedApp: result.usedApp, reason: result.reason };
  },

  mediaControl: async (action): Promise<MediaControlResult> => {
    const result = await safe(() => DeviceCapability.mediaControl({ action }), { ok: false, reason: undefined });
    return { ok: result.ok, action, reason: result.reason };
  },

  getDeviceStatus: async (): Promise<DeviceStatus> => {
    try {
      return await DeviceCapability.getDeviceStatus();
    } catch {
      return {
        batteryLevel: null,
        isCharging: null,
        isOnline: false,
        networkType: "unknown",
        wifiEnabled: null,
        bluetoothEnabled: null,
        deviceModel: null,
        androidVersion: null,
        storageAvailableBytes: null,
        storageTotalBytes: null,
      };
    }
  },

  requestNotificationPermission: async (): Promise<PermissionResult> =>
    safe(() => DeviceCapability.requestNotificationPermission(), { granted: false, reason: undefined }),

  postNotification: async (title, body): Promise<NotificationResult> =>
    safe(() => DeviceCapability.postNotification({ title, body }), { posted: false, reason: undefined }),
  openAppSettings: async () => safe(() => DeviceCapability.openAppSettings(), { opened: false }),
  getLastExitInfo: async () => safe(() => DeviceCapability.getLastExitInfo(), { available: false }),
};
