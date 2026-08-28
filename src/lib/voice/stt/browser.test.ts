import { describe, it, expect, vi, afterEach } from "vitest";
import { requestMicrophonePermission } from "./browser";

function mockGetUserMedia(impl: () => Promise<MediaStream>) {
  Object.defineProperty(navigator, "mediaDevices", {
    value: { getUserMedia: vi.fn(impl) },
    configurable: true,
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("requestMicrophonePermission", () => {
  it("reports granted with a real stream", async () => {
    const stop = vi.fn();
    mockGetUserMedia(async () => ({ getTracks: () => [{ stop }] }) as unknown as MediaStream);
    const result = await requestMicrophonePermission();
    expect(result).toEqual({ granted: true });
    expect(stop).toHaveBeenCalled(); // the probe stream is stopped, not kept open
  });

  it("distinguishes a user-denied permission from a missing microphone", async () => {
    mockGetUserMedia(async () => {
      throw Object.assign(new Error("denied"), { name: "NotAllowedError" });
    });
    expect(await requestMicrophonePermission()).toEqual({ granted: false, reason: "denied" });

    mockGetUserMedia(async () => {
      throw Object.assign(new Error("no device"), { name: "NotFoundError" });
    });
    expect(await requestMicrophonePermission()).toEqual({ granted: false, reason: "unavailable" });
  });

  it("falls back to a generic error reason for anything else", async () => {
    mockGetUserMedia(async () => {
      throw new Error("something else entirely");
    });
    expect(await requestMicrophonePermission()).toEqual({ granted: false, reason: "error" });
  });

  it("reports unavailable when getUserMedia doesn't exist at all", async () => {
    Object.defineProperty(navigator, "mediaDevices", { value: undefined, configurable: true });
    expect(await requestMicrophonePermission()).toEqual({ granted: false, reason: "unavailable" });
  });
});
