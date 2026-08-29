import { describe, it, expect, vi, afterEach } from "vitest";

const networkMock = { getStatus: vi.fn(), addListener: vi.fn() };

vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: vi.fn() },
}));
vi.mock("@capacitor/network", () => ({ Network: networkMock }));

import { Capacitor } from "@capacitor/core";

afterEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  vi.unstubAllGlobals();
});

describe("getNetworkOnline", () => {
  it("uses the native Network plugin when running inside the Android app", async () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    networkMock.getStatus.mockResolvedValue({ connected: true, connectionType: "wifi" });
    const { getNetworkOnline } = await import("./network");
    expect(await getNetworkOnline()).toBe(true);
  });

  it("falls back to navigator.onLine natively if the plugin call throws", async () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    networkMock.getStatus.mockRejectedValue(new Error("bridge unavailable"));
    vi.stubGlobal("navigator", { onLine: false });
    const { getNetworkOnline } = await import("./network");
    expect(await getNetworkOnline()).toBe(false);
  });

  it("uses navigator.onLine on the web", async () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);
    vi.stubGlobal("navigator", { onLine: true });
    const { getNetworkOnline } = await import("./network");
    expect(await getNetworkOnline()).toBe(true);
  });
});

describe("subscribeNetworkStatus", () => {
  it("registers a native listener and forwards connected changes", async () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    const capturedListeners: ((status: { connected: boolean }) => void)[] = [];
    const remove = vi.fn();
    networkMock.addListener.mockImplementation((_event: string, listener: (status: { connected: boolean }) => void) => {
      capturedListeners.push(listener);
      return Promise.resolve({ remove });
    });
    const { subscribeNetworkStatus } = await import("./network");
    const onChange = vi.fn();
    const unsubscribe = subscribeNetworkStatus(onChange);
    await Promise.resolve();
    await Promise.resolve();

    capturedListeners[0]({ connected: false });
    expect(onChange).toHaveBeenCalledWith(false);

    unsubscribe();
    expect(remove).toHaveBeenCalled();
  });

  it("falls back to window online/offline events on the web", async () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);
    const listeners: Record<string, () => void> = {};
    vi.stubGlobal("window", {
      addEventListener: vi.fn((event: string, cb: () => void) => {
        listeners[event] = cb;
      }),
      removeEventListener: vi.fn(),
    });
    const { subscribeNetworkStatus } = await import("./network");
    const onChange = vi.fn();
    const unsubscribe = subscribeNetworkStatus(onChange);

    listeners.offline();
    expect(onChange).toHaveBeenCalledWith(false);
    listeners.online();
    expect(onChange).toHaveBeenCalledWith(true);

    unsubscribe();
    expect(window.removeEventListener).toHaveBeenCalledTimes(2);
  });
});
