/**
 * Device capability abstraction — Phase 6's bridge from the existing
 * ReasoningEngine/ToolRegistry into the native Android layer.
 *
 * Same pattern as lib/voice/stt and lib/voice/tts: one interface, a
 * "native" implementation backed by the real Capacitor plugin, and an
 * "unavailable" implementation for every context that isn't running
 * inside the Android app (a normal browser tab, this web deployment on
 * its own, etc.) — never a third path that fakes success. See
 * manager.ts for how the right one gets picked, and
 * DeviceCapabilityPlugin.kt (android/app/src/main/java/com/jarvis/aios/)
 * for the native side of this contract.
 */

export type NetworkType = "wifi" | "cellular" | "none" | "unknown";

export interface DeviceStatus {
  batteryLevel: number | null; // 0..1
  isCharging: boolean | null;
  isOnline: boolean;
  networkType: NetworkType;
  wifiEnabled: boolean | null;
  bluetoothEnabled: boolean | null;
  deviceModel: string | null;
  androidVersion: string | null;
  storageAvailableBytes: number | null;
  storageTotalBytes: number | null;
}

export interface AppLaunchResult {
  launched: boolean;
  packageName: string;
  reason?: string;
}

export interface DeepLinkResult {
  opened: boolean;
  url: string;
  usedApp: boolean;
  reason?: string;
}

export type MediaAction = "play" | "pause" | "next" | "previous";

export interface MediaControlResult {
  ok: boolean;
  action: MediaAction;
  reason?: string;
}

export interface PermissionResult {
  granted: boolean;
  reason?: string;
}

export interface NotificationResult {
  posted: boolean;
  reason?: string;
}

export interface DeviceCapabilityProvider {
  /** "native" when actually running inside the Android app with the real
   * bridge available; "unavailable" everywhere else (web browser, this
   * Netlify deployment loaded directly, a WebView without the plugin). */
  id: "native" | "unavailable";
  isAvailable(): boolean;
  isAppAvailable(packageName: string): Promise<boolean>;
  launchApp(packageName: string): Promise<AppLaunchResult>;
  /** Opens a URL — a deep link into an installed app when one claims the
   * URL, the system browser otherwise. usedApp on the result says which
   * happened; never silently claims the app opened when it didn't. */
  openUrl(url: string): Promise<DeepLinkResult>;
  mediaControl(action: MediaAction): Promise<MediaControlResult>;
  getDeviceStatus(): Promise<DeviceStatus>;
  requestNotificationPermission(): Promise<PermissionResult>;
  postNotification(title: string, body: string): Promise<NotificationResult>;
  // Microphone permission is deliberately NOT duplicated here — the
  // existing lib/voice/stt/browser.ts requestMicrophonePermission()
  // already calls getUserMedia(), which inside the native Android WebView
  // triggers the same runtime RECORD_AUDIO prompt via
  // MainActivity's onPermissionRequest override (see android/app/src/main/java/com/jarvis/aios/MainActivity.java).
  // A second "device" path to the same permission would just be two ways
  // to do one thing — exactly what "no separate voice brain" rules out.
}
