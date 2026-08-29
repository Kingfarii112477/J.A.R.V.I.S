import { describe, it, expect } from "vitest";
import { computeSystemStatus, type SystemStatusInputs } from "./status";

const BASE: SystemStatusInputs = {
  networkOnline: true,
  aiConnection: "connected",
  isNativePlatform: false,
  deviceBridgeHealthy: null,
  micPermissionDenied: false,
};

describe("computeSystemStatus", () => {
  it("reports ONLINE when everything checks out", () => {
    expect(computeSystemStatus(BASE)).toBe("ONLINE");
  });

  it("reports OFFLINE above every other condition", () => {
    expect(
      computeSystemStatus({
        ...BASE,
        networkOnline: false,
        aiConnection: "error",
        micPermissionDenied: true,
      })
    ).toBe("OFFLINE");
  });

  it("reports DEVICE_BRIDGE_UNAVAILABLE only when native and the probe actually failed", () => {
    expect(computeSystemStatus({ ...BASE, isNativePlatform: true, deviceBridgeHealthy: false })).toBe(
      "DEVICE_BRIDGE_UNAVAILABLE"
    );
  });

  it("does not report DEVICE_BRIDGE_UNAVAILABLE on the web, even if deviceBridgeHealthy were somehow false", () => {
    expect(computeSystemStatus({ ...BASE, isNativePlatform: false, deviceBridgeHealthy: false })).toBe("ONLINE");
  });

  it("does not report DEVICE_BRIDGE_UNAVAILABLE when native but unprobed (null)", () => {
    expect(computeSystemStatus({ ...BASE, isNativePlatform: true, deviceBridgeHealthy: null })).toBe("ONLINE");
  });

  it("reports AI_PROVIDER_UNAVAILABLE when the health check failed", () => {
    expect(computeSystemStatus({ ...BASE, aiConnection: "error" })).toBe("AI_PROVIDER_UNAVAILABLE");
  });

  it("reports VOICE_UNAVAILABLE when mic permission was denied", () => {
    expect(computeSystemStatus({ ...BASE, micPermissionDenied: true })).toBe("VOICE_UNAVAILABLE");
  });

  it("reports DEGRADED for simulation-mode AI with nothing else wrong", () => {
    expect(computeSystemStatus({ ...BASE, aiConnection: "demo" })).toBe("DEGRADED");
  });

  it("AI_PROVIDER_UNAVAILABLE outranks VOICE_UNAVAILABLE", () => {
    expect(computeSystemStatus({ ...BASE, aiConnection: "error", micPermissionDenied: true })).toBe(
      "AI_PROVIDER_UNAVAILABLE"
    );
  });

  it("VOICE_UNAVAILABLE outranks DEGRADED", () => {
    expect(computeSystemStatus({ ...BASE, aiConnection: "demo", micPermissionDenied: true })).toBe("VOICE_UNAVAILABLE");
  });
});
