import { describe, it, expect, vi } from "vitest";

const pluginMock = {
  isAppAvailable: vi.fn(),
  launchApp: vi.fn(),
  openUrl: vi.fn(),
  mediaControl: vi.fn(),
  getDeviceStatus: vi.fn(),
  requestNotificationPermission: vi.fn(),
  postNotification: vi.fn(),
};

vi.mock("@capacitor/core", () => ({
  registerPlugin: () => pluginMock,
}));

const { nativeDeviceProvider } = await import("./native");

describe("nativeDeviceProvider", () => {
  it("reports available", () => {
    expect(nativeDeviceProvider.isAvailable()).toBe(true);
  });

  it("passes through a successful launchApp call", async () => {
    pluginMock.launchApp.mockResolvedValue({ launched: true });
    const result = await nativeDeviceProvider.launchApp("com.google.android.youtube");
    expect(result).toEqual({ launched: true, packageName: "com.google.android.youtube", reason: undefined });
  });

  it("turns a thrown plugin call into an honest failure result instead of an unhandled rejection", async () => {
    pluginMock.launchApp.mockRejectedValue(new Error("bridge disconnected"));
    const result = await nativeDeviceProvider.launchApp("com.google.android.youtube");
    expect(result.launched).toBe(false);
    expect(result.reason).toMatch(/bridge disconnected/i);
  });

  it("isAppAvailable degrades to false (never throws) when the plugin call fails", async () => {
    pluginMock.isAppAvailable.mockRejectedValue(new Error("native error"));
    await expect(nativeDeviceProvider.isAppAvailable("com.google.android.youtube")).resolves.toBe(false);
  });

  it("openUrl reports usedApp honestly from the native result", async () => {
    pluginMock.openUrl.mockResolvedValue({ opened: true, usedApp: true });
    const result = await nativeDeviceProvider.openUrl("https://youtube.com/results?search_query=test");
    expect(result.opened).toBe(true);
    expect(result.usedApp).toBe(true);
  });

  it("getDeviceStatus degrades to an honest all-null/offline status when the plugin call fails", async () => {
    pluginMock.getDeviceStatus.mockRejectedValue(new Error("native error"));
    const status = await nativeDeviceProvider.getDeviceStatus();
    expect(status.isOnline).toBe(false);
    expect(status.batteryLevel).toBeNull();
  });

  it("passes through a successful getDeviceStatus call unmodified", async () => {
    const real = {
      batteryLevel: 0.72,
      isCharging: false,
      isOnline: true,
      networkType: "wifi" as const,
      wifiEnabled: true,
      bluetoothEnabled: false,
      deviceModel: "Pixel 8",
      androidVersion: "15",
      storageAvailableBytes: 1_000_000,
      storageTotalBytes: 128_000_000_000,
    };
    pluginMock.getDeviceStatus.mockResolvedValue(real);
    expect(await nativeDeviceProvider.getDeviceStatus()).toEqual(real);
  });

  it("mediaControl reports the requested action even on failure", async () => {
    pluginMock.mediaControl.mockRejectedValue(new Error("no active session"));
    const result = await nativeDeviceProvider.mediaControl("pause");
    expect(result.action).toBe("pause");
    expect(result.ok).toBe(false);
  });

  it("postNotification passes through a successful post", async () => {
    pluginMock.postNotification.mockResolvedValue({ posted: true });
    expect(await nativeDeviceProvider.postNotification("Title", "Body")).toEqual({ posted: true, reason: undefined });
  });
});
