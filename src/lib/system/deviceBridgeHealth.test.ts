import { describe, it, expect, vi, afterEach } from "vitest";

const getDeviceCapabilityProvider = vi.fn();

vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: vi.fn() },
}));
vi.mock("@/lib/device", () => ({ getDeviceCapabilityProvider }));

import { Capacitor } from "@capacitor/core";

afterEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

describe("probeDeviceBridgeHealth", () => {
  it("returns null when not running inside the native app (not applicable)", async () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);
    const { probeDeviceBridgeHealth } = await import("./deviceBridgeHealth");
    expect(await probeDeviceBridgeHealth()).toBeNull();
    expect(getDeviceCapabilityProvider).not.toHaveBeenCalled();
  });

  it("returns true when the native plugin returns a real device model/version", async () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    getDeviceCapabilityProvider.mockReturnValue({
      getDeviceStatus: vi.fn().mockResolvedValue({ deviceModel: "Pixel 8", androidVersion: "15" }),
    });
    const { probeDeviceBridgeHealth } = await import("./deviceBridgeHealth");
    expect(await probeDeviceBridgeHealth()).toBe(true);
  });

  it("returns false when the plugin call falls back to the honest all-null shape", async () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    getDeviceCapabilityProvider.mockReturnValue({
      getDeviceStatus: vi.fn().mockResolvedValue({ deviceModel: null, androidVersion: null }),
    });
    const { probeDeviceBridgeHealth } = await import("./deviceBridgeHealth");
    expect(await probeDeviceBridgeHealth()).toBe(false);
  });

  it("returns false rather than throwing when the call itself rejects", async () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    getDeviceCapabilityProvider.mockReturnValue({
      getDeviceStatus: vi.fn().mockRejectedValue(new Error("bridge unavailable")),
    });
    const { probeDeviceBridgeHealth } = await import("./deviceBridgeHealth");
    expect(await probeDeviceBridgeHealth()).toBe(false);
  });
});
