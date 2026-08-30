import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("onnxruntime-web", () => ({
  env: { wasm: { numThreads: 1 } },
  Tensor: class {
    constructor(
      public type: string,
      public data: Float32Array,
      public dims: number[]
    ) {}
  },
  InferenceSession: { create: vi.fn() },
}));

import { downsample, OpenWakeWordWebEngine } from "./openWakeWordWeb";
import { WAKE_MODEL } from "@/config/voice";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("downsample", () => {
  it("returns the input untouched when rates already match", () => {
    const input = new Float32Array([0.1, 0.2, 0.3]);
    expect(downsample(input, 16000, 16000)).toBe(input);
  });

  it("reduces 48kHz to 16kHz at a 1:3 ratio", () => {
    const input = new Float32Array(48000).fill(0.5);
    const out = downsample(input, 48000, WAKE_MODEL.sampleRate);
    expect(out.length).toBe(16000);
  });

  it("preserves a constant signal's amplitude", () => {
    const input = new Float32Array(4800).fill(0.42);
    const out = downsample(input, 48000, 16000);
    for (const v of out) expect(v).toBeCloseTo(0.42, 5);
  });

  it("never reads past the end of the input", () => {
    const input = new Float32Array([1, 2, 3, 4, 5]);
    const out = downsample(input, 44100, 16000);
    for (const v of out) expect(Number.isFinite(v)).toBe(true);
  });
});

describe("OpenWakeWordWebEngine.isSupported", () => {
  it("is false without getUserMedia", () => {
    vi.stubGlobal("window", { isSecureContext: true, AudioContext: function () {} });
    vi.stubGlobal("navigator", {});
    expect(OpenWakeWordWebEngine.isSupported()).toBe(false);
  });

  it("is false on an insecure (http) page, because getUserMedia requires HTTPS", () => {
    vi.stubGlobal("window", { isSecureContext: false, AudioContext: function () {} });
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia: vi.fn() } });
    expect(OpenWakeWordWebEngine.isSupported()).toBe(false);
  });

  it("is true with a secure context, getUserMedia and AudioContext", () => {
    vi.stubGlobal("window", { isSecureContext: true, AudioContext: function () {} });
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia: vi.fn() } });
    expect(OpenWakeWordWebEngine.isSupported()).toBe(true);
  });
});

describe("OpenWakeWordWebEngine start() failure reporting", () => {
  it("reports an unsupported/insecure page honestly instead of silently doing nothing", async () => {
    vi.stubGlobal("window", { isSecureContext: false, AudioContext: function () {} });
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia: vi.fn() } });
    const engine = new OpenWakeWordWebEngine();
    const onError = vi.fn();
    const onStatus = vi.fn();
    const started = await engine.start({ onWake: vi.fn(), onStatus, onError });

    expect(started).toBe(false);
    expect(engine.isRunning).toBe(false);
    expect(onStatus).toHaveBeenCalledWith("error", expect.stringMatching(/HTTPS/i));
    expect(onError).toHaveBeenCalledWith(expect.stringMatching(/HTTPS/i));
  });
});
