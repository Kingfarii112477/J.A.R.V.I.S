import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { ServerTTSProvider } from "./provider";

class FakeAudio {
  volume = 1;
  playbackRate = 1;
  onplay: (() => void) | null = null;
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  playImpl: () => Promise<void> = () => Promise.resolve();
  constructor(public src?: string) {}
  play() {
    return this.playImpl();
  }
  pause() {}
}

let lastAudio: FakeAudio | null = null;

beforeEach(() => {
  lastAudio = null;
  vi.stubGlobal(
    "Audio",
    class extends FakeAudio {
      constructor(src?: string) {
        super(src);
        // eslint-disable-next-line @typescript-eslint/no-this-alias -- capturing the constructed test double for inspection, not working around `this` binding
        lastAudio = this;
      }
    }
  );
  vi.stubGlobal("URL", { createObjectURL: vi.fn(() => "blob:fake"), revokeObjectURL: vi.fn() });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function jsonResponse(body: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => body, blob: async () => new Blob() } as Response;
}

describe("ServerTTSProvider error handling", () => {
  it("reports 'unavailable' for a 501 (provider not configured on the server) without leaking anything but the message", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ unavailable: true, message: "Azure Speech is not configured on the server." }, 501)));
    const provider = new ServerTTSProvider("azure");
    const onError = vi.fn();
    await provider.speak("hello", { onError });
    expect(onError).toHaveBeenCalledWith("Azure Speech is not configured on the server.", "unavailable");
  });

  it("reports a network failure honestly when fetch itself throws", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    const provider = new ServerTTSProvider("azure");
    const onError = vi.fn();
    await provider.speak("hello", { onError });
    expect(onError).toHaveBeenCalledWith("Could not reach the speech synthesis service.", "error");
  });

  it("reports a playback-blocked error distinctly from a network failure when play() is rejected", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, 200)));
    vi.stubGlobal(
      "Audio",
      class extends FakeAudio {
        constructor(src?: string) {
          super(src);
          // eslint-disable-next-line @typescript-eslint/no-this-alias -- capturing the constructed test double for inspection, not working around `this` binding
          lastAudio = this;
          this.playImpl = () => Promise.reject(Object.assign(new Error("blocked"), { name: "NotAllowedError" }));
        }
      }
    );
    const provider = new ServerTTSProvider("azure");
    const onError = vi.fn();
    await provider.speak("hello", { onError });
    expect(onError).toHaveBeenCalledWith(expect.stringContaining("blocked by the browser"), "error");
  });

  it("plays successfully and fires onStart/onEnd for a real successful response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, 200)));
    const provider = new ServerTTSProvider("azure");
    const onStart = vi.fn();
    const onEnd = vi.fn();
    await provider.speak("hello", { onStart, onEnd });
    lastAudio?.onplay?.();
    expect(onStart).toHaveBeenCalled();
    lastAudio?.onended?.();
    expect(onEnd).toHaveBeenCalled();
  });

  it("cancel() before a response arrives silently drops the result — no callback fires", async () => {
    let resolveFetch: (r: Response) => void = () => {};
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>((resolve) => (resolveFetch = resolve)))
    );
    const provider = new ServerTTSProvider("azure");
    const onError = vi.fn();
    const onEnd = vi.fn();
    const speakPromise = provider.speak("hello", { onError, onEnd });
    provider.cancel();
    resolveFetch(jsonResponse({}, 200));
    await speakPromise;
    expect(onError).not.toHaveBeenCalled();
    expect(onEnd).not.toHaveBeenCalled();
  });
});
