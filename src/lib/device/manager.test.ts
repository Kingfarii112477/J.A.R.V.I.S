import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: vi.fn() },
  registerPlugin: vi.fn(() => ({
    isAppAvailable: vi.fn(),
    launchApp: vi.fn(),
    openUrl: vi.fn(),
    mediaControl: vi.fn(),
    getDeviceStatus: vi.fn(),
    requestNotificationPermission: vi.fn(),
    postNotification: vi.fn(),
  })),
}));

import { Capacitor } from "@capacitor/core";

afterEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

describe("getDeviceCapabilityProvider", () => {
  it("returns the unavailable provider outside the native Android app", async () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);
    const { getDeviceCapabilityProvider } = await import("./manager");
    expect(getDeviceCapabilityProvider().id).toBe("unavailable");
  });

  it("returns the native provider inside the native Android app", async () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    const { getDeviceCapabilityProvider } = await import("./manager");
    expect(getDeviceCapabilityProvider().id).toBe("native");
  });

  it("caches the result rather than re-checking Capacitor.isNativePlatform on every call", async () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);
    const { getDeviceCapabilityProvider } = await import("./manager");
    getDeviceCapabilityProvider();
    getDeviceCapabilityProvider();
    getDeviceCapabilityProvider();
    expect(Capacitor.isNativePlatform).toHaveBeenCalledTimes(1);
  });

  it("resetDeviceCapabilityProviderCache forces a fresh read", async () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);
    const { getDeviceCapabilityProvider, resetDeviceCapabilityProviderCache } = await import("./manager");
    expect(getDeviceCapabilityProvider().id).toBe("unavailable");

    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    resetDeviceCapabilityProviderCache();
    expect(getDeviceCapabilityProvider().id).toBe("native");
  });
});
