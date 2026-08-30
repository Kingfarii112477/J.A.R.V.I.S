import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: vi.fn() },
  registerPlugin: vi.fn(() => ({
    isAvailable: vi.fn(),
    getState: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    resumeStandby: vi.fn(),
    handOff: vi.fn(),
    addListener: vi.fn(() => Promise.resolve({ remove: vi.fn() })),
  })),
}));

import { Capacitor } from "@capacitor/core";
import { OpenWakeWordWebEngine } from "@/lib/voice/wake/openWakeWordWeb";

vi.mock("@/lib/voice/wake/openWakeWordWeb", () => ({
  OpenWakeWordWebEngine: Object.assign(
    class {
      isRunning = false;
      setThreshold() {}
      setDebounce() {}
      async start() {
        return true;
      }
      async stop() {}
      async release() {}
    },
    { isSupported: vi.fn(() => false) }
  ),
}));

afterEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

describe("getContinuousListeningProvider", () => {
  it("falls back to the unavailable provider when the browser can't support detection", async () => {
    // e.g. an http:// page, where getUserMedia doesn't exist at all.
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);
    vi.mocked(OpenWakeWordWebEngine.isSupported).mockReturnValue(false);
    const { getContinuousListeningProvider } = await import("./manager");
    expect(getContinuousListeningProvider().id).toBe("unavailable");
  });

  it("uses the real in-browser openWakeWord provider on a supported page", async () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);
    vi.mocked(OpenWakeWordWebEngine.isSupported).mockReturnValue(true);
    const { getContinuousListeningProvider } = await import("./manager");
    const provider = getContinuousListeningProvider();
    expect(provider.id).toBe("web");
    const availability = await provider.checkAvailability();
    expect(availability.engineId).toBe("openwakeword-web");
  });

  it("returns the native provider inside the native Android app", async () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    const { getContinuousListeningProvider } = await import("./manager");
    expect(getContinuousListeningProvider().id).toBe("native");
  });

  it("caches rather than re-checking on every call", async () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);
    vi.mocked(OpenWakeWordWebEngine.isSupported).mockReturnValue(false);
    const { getContinuousListeningProvider } = await import("./manager");
    getContinuousListeningProvider();
    getContinuousListeningProvider();
    getContinuousListeningProvider();
    expect(Capacitor.isNativePlatform).toHaveBeenCalledTimes(1);
  });

  it("resetContinuousListeningProviderCache forces a fresh read", async () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);
    vi.mocked(OpenWakeWordWebEngine.isSupported).mockReturnValue(false);
    const { getContinuousListeningProvider, resetContinuousListeningProviderCache } = await import("./manager");
    expect(getContinuousListeningProvider().id).toBe("unavailable");

    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    resetContinuousListeningProviderCache();
    expect(getContinuousListeningProvider().id).toBe("native");
  });
});

describe("unavailableContinuousProvider", () => {
  it("never reports listening as started", async () => {
    const { unavailableContinuousProvider } = await import("./unavailable");
    const result = await unavailableContinuousProvider.start({ sensitivity: 0.5, batterySaver: true });
    expect(result.started).toBe(false);
    expect(result.reason).toMatch(/native J\.A\.R\.V\.I\.S Android app/i);
  });

  it("reports itself unavailable with a reason rather than failing silently", async () => {
    const { unavailableContinuousProvider } = await import("./unavailable");
    const availability = await unavailableContinuousProvider.checkAvailability();
    expect(availability.available).toBe(false);
    expect(availability.reason).toBeTruthy();
  });

  it("reports a STOPPED state, never a fake STANDBY", async () => {
    const { unavailableContinuousProvider } = await import("./unavailable");
    const snapshot = await unavailableContinuousProvider.getState();
    expect(snapshot.state).toBe("STOPPED");
    expect(snapshot.available).toBe(false);
  });

  it("subscribe returns a safe no-op unsubscribe", async () => {
    const { unavailableContinuousProvider } = await import("./unavailable");
    const unsubscribe = unavailableContinuousProvider.subscribe({
      onWakeWord: vi.fn(),
      onStateChange: vi.fn(),
      onError: vi.fn(),
    });
    expect(() => unsubscribe()).not.toThrow();
  });
});
