import { z } from "zod";
import { toolRegistry } from "./registry";
import { getDeviceCapabilityProvider } from "@/lib/device";
import type { ToolDefinition } from "@/types/tools";

/**
 * Device capability tools — the DeviceAgent's surface, per the Phase 6
 * spec's ReasoningEngine -> ToolRegistry -> DeviceAgent -> PermissionManager
 * -> DeviceCapabilityProvider -> Native Android Bridge chain. Every tool
 * here just calls into getDeviceCapabilityProvider() (src/lib/device/) —
 * there is no second execution path, no bypass of the existing
 * executeTool()/governance/audit pipeline every other tool already goes
 * through. Outside the native Android app, every one of these reports an
 * honest "not available" rather than pretending to control a device that
 * isn't there.
 *
 * KNOWN_APPS must stay in sync with AndroidManifest.xml's <queries> block —
 * Android 11+ hides package visibility for anything not declared there,
 * so a name missing from both places will always report "not installed"
 * even when it genuinely is.
 */
const KNOWN_APPS: Record<string, string> = {
  youtube: "com.google.android.youtube",
  whatsapp: "com.whatsapp",
  gmail: "com.google.android.gm",
  chrome: "com.android.chrome",
  maps: "com.google.android.apps.maps",
  "google maps": "com.google.android.apps.maps",
  spotify: "com.spotify.music",
  settings: "com.android.settings",
};

/** Exported for youtube_search (deviceTools/youtube.ts) and for tests —
 * the one place an app name resolves to a package name. */
export function resolveAppPackage(appName: string): string | null {
  return KNOWN_APPS[appName.trim().toLowerCase()] ?? null;
}

const launchAppTool: ToolDefinition<{ appName: string }, { launched: boolean; appName: string; reason?: string }> = {
  name: "launch_app",
  description:
    `Launch an installed app on the device by name. Supported names: ${Object.keys(KNOWN_APPS).join(", ")}. ` +
    "Only works inside the native Android app — report the real result, never claim success it didn't achieve.",
  parameters: z.object({ appName: z.string().min(1).max(60) }),
  permission: "SAFE",
  requiresConfirmation: false,
  async execute(args) {
    const packageName = resolveAppPackage(args.appName);
    if (!packageName) {
      return { launched: false, appName: args.appName, reason: `"${args.appName}" isn't a recognized app.` };
    }
    const result = await getDeviceCapabilityProvider().launchApp(packageName);
    return { launched: result.launched, appName: args.appName, reason: result.reason };
  },
  formatResult(r) {
    return r.launched ? `Launched ${r.appName}.` : `Couldn't launch ${r.appName}${r.reason ? `: ${r.reason}` : "."}`;
  },
};

const isAppAvailableTool: ToolDefinition<{ appName: string }, { appName: string; available: boolean }> = {
  name: "is_app_available",
  description: `Check whether a specific app is installed, without launching it. Supported names: ${Object.keys(KNOWN_APPS).join(", ")}.`,
  parameters: z.object({ appName: z.string().min(1).max(60) }),
  permission: "SAFE",
  requiresConfirmation: false,
  async execute(args) {
    const packageName = resolveAppPackage(args.appName);
    if (!packageName) return { appName: args.appName, available: false };
    const available = await getDeviceCapabilityProvider().isAppAvailable(packageName);
    return { appName: args.appName, available };
  },
  formatResult(r) {
    return `${r.appName} is ${r.available ? "installed" : "not installed"}.`;
  },
};

const openUrlTool: ToolDefinition<{ url: string }, { opened: boolean; usedApp: boolean; url: string; reason?: string }> = {
  name: "open_url",
  description: "Open a URL — a deep link into an installed app when one claims it, the browser otherwise.",
  parameters: z.object({ url: z.string().url().max(2000) }),
  permission: "SAFE",
  requiresConfirmation: false,
  async execute(args) {
    const result = await getDeviceCapabilityProvider().openUrl(args.url);
    return { opened: result.opened, usedApp: result.usedApp, url: args.url, reason: result.reason };
  },
  formatResult(r) {
    if (!r.opened) return `Couldn't open that URL${r.reason ? `: ${r.reason}` : "."}`;
    return r.usedApp ? "Opened in the associated app." : "Opened in the browser.";
  },
};

const mediaControlTool: ToolDefinition<{ action: "play" | "pause" | "next" | "previous" }, { ok: boolean; action: string; reason?: string }> = {
  name: "media_control",
  description: "Send a media control action (play, pause, next, previous) to whatever's currently playing.",
  parameters: z.object({ action: z.enum(["play", "pause", "next", "previous"]) }),
  permission: "SAFE",
  requiresConfirmation: false,
  async execute(args) {
    const result = await getDeviceCapabilityProvider().mediaControl(args.action);
    return { ok: result.ok, action: args.action, reason: result.reason };
  },
  formatResult(r) {
    return r.ok ? `Media: ${r.action}.` : `Couldn't send the ${r.action} command${r.reason ? `: ${r.reason}` : "."}`;
  },
};

const deviceStatusTool: ToolDefinition<
  Record<string, never>,
  {
    available: boolean;
    batteryLevel: number | null;
    isCharging: boolean | null;
    isOnline: boolean;
    networkType: string;
    wifiEnabled: boolean | null;
    bluetoothEnabled: boolean | null;
    deviceModel: string | null;
    androidVersion: string | null;
  }
> = {
  name: "device_status",
  description: "Report real device status: battery, charging, network, Wi-Fi, Bluetooth, model, Android version.",
  parameters: z.object({}),
  permission: "SAFE",
  requiresConfirmation: false,
  async execute() {
    const provider = getDeviceCapabilityProvider();
    const status = await provider.getDeviceStatus();
    return { available: provider.isAvailable(), ...status };
  },
  formatResult(r) {
    if (!r.available) return "Device status is only available inside the native Android app.";
    const parts: string[] = [];
    if (r.batteryLevel !== null) parts.push(`battery ${Math.round(r.batteryLevel * 100)}%${r.isCharging ? " (charging)" : ""}`);
    parts.push(r.isOnline ? `online via ${r.networkType}` : "offline");
    if (r.deviceModel) parts.push(r.deviceModel);
    return parts.join(", ") + ".";
  },
};

/** The Phase 6 spec's worked example: "JARVIS YouTube par new Urdu rap
 * songs search karo" -> youtube_search({query: "new Urdu rap songs"}).
 * Deliberately just an openUrl() call at a YouTube search URL, not a
 * separate code path: YouTube registers as the verified App Link handler
 * for youtube.com URLs, so the SAME app-vs-browser resolution openUrl()
 * already does correctly picks the YouTube app when installed and falls
 * back to the browser when it isn't — no vnd.youtube: intent needed, and
 * no second way to "open a URL" for this one case specifically. */
const youtubeSearchTool: ToolDefinition<{ query: string }, { opened: boolean; usedApp: boolean; query: string; reason?: string }> = {
  name: "youtube_search",
  description:
    "Search YouTube for a query. Opens the YouTube app if installed, a YouTube web search otherwise. " +
    "Report exactly what happened (app vs. browser, or failure) — never claim it opened when it didn't.",
  parameters: z.object({ query: z.string().min(1).max(200) }),
  permission: "SAFE",
  requiresConfirmation: false,
  async execute(args) {
    const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(args.query)}`;
    const result = await getDeviceCapabilityProvider().openUrl(url);
    return { opened: result.opened, usedApp: result.usedApp, query: args.query, reason: result.reason };
  },
  formatResult(r) {
    if (!r.opened) return `Couldn't search YouTube for "${r.query}"${r.reason ? `: ${r.reason}` : "."}`;
    return r.usedApp
      ? `Opened the YouTube app and searched for "${r.query}".`
      : `Opened a YouTube search for "${r.query}" in the browser (the YouTube app isn't installed).`;
  },
};

const sendNotificationTool: ToolDefinition<{ title: string; body: string }, { posted: boolean; reason?: string }> = {
  name: "send_notification",
  description: "Post an Android notification with a title and body.",
  parameters: z.object({ title: z.string().min(1).max(80), body: z.string().min(1).max(400) }),
  permission: "SAFE",
  requiresConfirmation: false,
  async execute(args) {
    const provider = getDeviceCapabilityProvider();
    const permission = await provider.requestNotificationPermission();
    if (!permission.granted) return { posted: false, reason: permission.reason ?? "Notification permission not granted." };
    return provider.postNotification(args.title, args.body);
  },
  formatResult(r) {
    return r.posted ? "Notification sent." : `Couldn't send the notification${r.reason ? `: ${r.reason}` : "."}`;
  },
};

let registered = false;

export function registerDeviceTools() {
  if (registered) return;
  registered = true;
  for (const tool of [
    launchAppTool,
    isAppAvailableTool,
    openUrlTool,
    mediaControlTool,
    deviceStatusTool,
    sendNotificationTool,
    youtubeSearchTool,
  ]) {
    toolRegistry.register(tool);
  }
}
