import { describe, it, expect, vi, beforeEach } from "vitest";
import { executeTool } from "./executor";
import { toolRegistry } from "./registry";
import { registerDeviceTools, resolveAppPackage } from "./deviceTools";

const providerMock = {
  id: "native" as const,
  isAvailable: vi.fn(() => true),
  isAppAvailable: vi.fn(),
  launchApp: vi.fn(),
  openUrl: vi.fn(),
  mediaControl: vi.fn(),
  getDeviceStatus: vi.fn(),
  requestNotificationPermission: vi.fn(),
  postNotification: vi.fn(),
};

vi.mock("@/lib/device", () => ({
  getDeviceCapabilityProvider: () => providerMock,
}));

registerDeviceTools();

const ctx = { sessionId: "test", source: "chat" as const };

beforeEach(() => {
  vi.clearAllMocks();
  providerMock.isAvailable.mockReturnValue(true);
});

describe("resolveAppPackage", () => {
  it("resolves known app names case-insensitively", () => {
    expect(resolveAppPackage("YouTube")).toBe("com.google.android.youtube");
    expect(resolveAppPackage("  whatsapp ")).toBe("com.whatsapp");
  });

  it("returns null for an unrecognized app name", () => {
    expect(resolveAppPackage("some random app")).toBeNull();
  });
});

describe("launch_app tool", () => {
  it("is registered as SAFE (no confirmation needed to open an app)", () => {
    expect(toolRegistry.get("launch_app")?.permission).toBe("SAFE");
  });

  it("resolves a known app name and calls the real device provider — never a second execution path", async () => {
    providerMock.launchApp.mockResolvedValue({ launched: true, packageName: "com.google.android.youtube" });
    const result = await executeTool("launch_app", { appName: "youtube" }, ctx, false);
    expect(providerMock.launchApp).toHaveBeenCalledWith("com.google.android.youtube");
    expect(result.ok).toBe(true);
    expect(result.summary).toMatch(/launched youtube/i);
  });

  it("reports an unrecognized app name honestly without calling the provider", async () => {
    const result = await executeTool("launch_app", { appName: "some fictional app" }, ctx, false);
    expect(providerMock.launchApp).not.toHaveBeenCalled();
    expect(result.summary).toMatch(/isn't a recognized app/i);
  });

  it("surfaces the native provider's real failure reason instead of claiming success", async () => {
    providerMock.launchApp.mockResolvedValue({ launched: false, reason: "com.whatsapp is not installed on this device." });
    const result = await executeTool("launch_app", { appName: "whatsapp" }, ctx, false);
    expect(result.summary).toMatch(/not installed/i);
  });
});

describe("is_app_available tool", () => {
  it("reports real availability from the device provider", async () => {
    providerMock.isAppAvailable.mockResolvedValue(true);
    const result = await executeTool("is_app_available", { appName: "spotify" }, ctx, false);
    expect(providerMock.isAppAvailable).toHaveBeenCalledWith("com.spotify.music");
    expect(result.summary).toMatch(/installed/i);
  });
});

describe("open_url tool", () => {
  it("reports whether an app or the browser handled the URL", async () => {
    providerMock.openUrl.mockResolvedValue({ opened: true, usedApp: true, url: "https://youtube.com/watch?v=1" });
    const result = await executeTool("open_url", { url: "https://youtube.com/watch?v=1" }, ctx, false);
    expect(result.summary).toMatch(/associated app/i);
  });

  it("reports a browser fallback honestly", async () => {
    providerMock.openUrl.mockResolvedValue({ opened: true, usedApp: false, url: "https://example.com" });
    const result = await executeTool("open_url", { url: "https://example.com" }, ctx, false);
    expect(result.summary).toMatch(/browser/i);
  });
});

describe("media_control tool", () => {
  it("passes the requested action through and reports the real outcome", async () => {
    providerMock.mediaControl.mockResolvedValue({ ok: true, action: "pause" });
    const result = await executeTool("media_control", { action: "pause" }, ctx, false);
    expect(providerMock.mediaControl).toHaveBeenCalledWith("pause");
    expect(result.summary).toMatch(/pause/i);
  });
});

describe("device_status tool", () => {
  it("reports the native provider's real status", async () => {
    providerMock.getDeviceStatus.mockResolvedValue({
      batteryLevel: 0.5,
      isCharging: false,
      isOnline: true,
      networkType: "wifi",
      wifiEnabled: true,
      bluetoothEnabled: false,
      deviceModel: "Pixel 8",
      androidVersion: "15",
      storageAvailableBytes: 1,
      storageTotalBytes: 2,
    });
    const result = await executeTool("device_status", {}, ctx, false);
    expect(result.summary).toMatch(/battery 50%/i);
    expect(result.summary).toMatch(/online via wifi/i);
  });

  it("reports unavailable honestly when the bridge isn't native", async () => {
    providerMock.isAvailable.mockReturnValue(false);
    providerMock.getDeviceStatus.mockResolvedValue({
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
    });
    const result = await executeTool("device_status", {}, ctx, false);
    expect(result.summary).toMatch(/only available inside the native android app/i);
  });
});

describe("send_notification tool", () => {
  it("requests permission before posting, never bypassing it", async () => {
    providerMock.requestNotificationPermission.mockResolvedValue({ granted: true });
    providerMock.postNotification.mockResolvedValue({ posted: true });
    const result = await executeTool("send_notification", { title: "Diagnostics", body: "Complete." }, ctx, false);
    expect(providerMock.requestNotificationPermission).toHaveBeenCalled();
    expect(providerMock.postNotification).toHaveBeenCalledWith("Diagnostics", "Complete.");
    expect(result.summary).toMatch(/notification sent/i);
  });

  it("never posts when permission is denied", async () => {
    providerMock.requestNotificationPermission.mockResolvedValue({ granted: false, reason: "Notification permission was denied." });
    const result = await executeTool("send_notification", { title: "T", body: "B" }, ctx, false);
    expect(providerMock.postNotification).not.toHaveBeenCalled();
    expect(result.summary).toMatch(/denied/i);
  });
});

describe("youtube_search tool", () => {
  it("builds a youtube.com search URL and opens it via the same openUrl path as any other link", async () => {
    providerMock.openUrl.mockResolvedValue({ opened: true, usedApp: true, url: "https://www.youtube.com/results?search_query=new%20Urdu%20rap%20songs" });
    const result = await executeTool("youtube_search", { query: "new Urdu rap songs" }, ctx, false);
    expect(providerMock.openUrl).toHaveBeenCalledWith("https://www.youtube.com/results?search_query=new%20Urdu%20rap%20songs");
    expect(result.summary).toMatch(/opened the youtube app/i);
    expect(result.summary).toContain("new Urdu rap songs");
  });

  it("reports the browser fallback honestly when the YouTube app isn't installed", async () => {
    providerMock.openUrl.mockResolvedValue({ opened: true, usedApp: false, url: "https://www.youtube.com/results?search_query=lofi" });
    const result = await executeTool("youtube_search", { query: "lofi" }, ctx, false);
    expect(result.summary).toMatch(/browser/i);
    expect(result.summary).toMatch(/youtube app isn't installed/i);
  });

  it("never claims success when the device bridge reports it couldn't open anything", async () => {
    providerMock.openUrl.mockResolvedValue({ opened: false, usedApp: false, url: "https://www.youtube.com/results?search_query=x", reason: "No app on this device can open that URL." });
    const result = await executeTool("youtube_search", { query: "x" }, ctx, false);
    expect(result.summary).toMatch(/couldn't search youtube/i);
  });
});

describe("every device tool", () => {
  it("is SAFE — never bypasses the confirmation system for tools that don't need it, but also never claims a destructive capability", () => {
    for (const name of ["launch_app", "is_app_available", "open_url", "media_control", "device_status", "send_notification", "youtube_search"]) {
      expect(toolRegistry.get(name)?.permission).toBe("SAFE");
    }
  });
});
