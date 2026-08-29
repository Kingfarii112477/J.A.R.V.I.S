import { describe, it, expect } from "vitest";
import { unavailableDeviceProvider } from "./unavailable";

describe("unavailableDeviceProvider", () => {
  it("is never available", () => {
    expect(unavailableDeviceProvider.isAvailable()).toBe(false);
  });

  it("never claims an app is available", async () => {
    expect(await unavailableDeviceProvider.isAppAvailable("com.google.android.youtube")).toBe(false);
  });

  it("never claims an app launched, with a clear reason", async () => {
    const result = await unavailableDeviceProvider.launchApp("com.google.android.youtube");
    expect(result.launched).toBe(false);
    expect(result.packageName).toBe("com.google.android.youtube");
    expect(result.reason).toMatch(/only available/i);
  });

  it("never claims a URL/deep link opened", async () => {
    const result = await unavailableDeviceProvider.openUrl("https://youtube.com");
    expect(result.opened).toBe(false);
    expect(result.usedApp).toBe(false);
    expect(result.reason).toBeTruthy();
  });

  it("never claims a media control action succeeded", async () => {
    const result = await unavailableDeviceProvider.mediaControl("play");
    expect(result.ok).toBe(false);
    expect(result.action).toBe("play");
  });

  it("returns device status with every native-only field null, never fabricated", async () => {
    const status = await unavailableDeviceProvider.getDeviceStatus();
    expect(status.batteryLevel).toBeNull();
    expect(status.deviceModel).toBeNull();
    expect(status.androidVersion).toBeNull();
    expect(status.networkType).toBe("unknown");
  });

  it("never claims a notification permission was granted or posted", async () => {
    expect((await unavailableDeviceProvider.requestNotificationPermission()).granted).toBe(false);
    expect((await unavailableDeviceProvider.postNotification("t", "b")).posted).toBe(false);
  });
});
