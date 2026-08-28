import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

function makeFakeAnalyser(fillValue: number) {
  return {
    fftSize: 0,
    smoothingTimeConstant: 0,
    frequencyBinCount: 4,
    connect: vi.fn(),
    getByteFrequencyData: vi.fn((arr: Uint8Array) => arr.fill(fillValue)),
  };
}

function makeFakeAudioContext(fillValue = 128) {
  return {
    createMediaElementSource: vi.fn(() => ({ connect: vi.fn() })),
    createAnalyser: vi.fn(() => makeFakeAnalyser(fillValue)),
    close: vi.fn(async () => {}),
    destination: {},
  };
}

describe("ttsAmplitude", () => {
  let rafCallback: FrameRequestCallback | null = null;
  let rafCancelled: number[] = [];
  let nextRafId = 1;
  let getTTSProviderMock: ReturnType<typeof vi.fn>;
  let AudioContextCtor: ReturnType<typeof vi.fn>;
  let lastCtx: ReturnType<typeof makeFakeAudioContext> | null = null;

  beforeEach(() => {
    vi.resetModules();
    rafCallback = null;
    rafCancelled = [];
    nextRafId = 1;
    lastCtx = null;

    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      rafCallback = cb;
      return nextRafId++;
    });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => {
      rafCancelled.push(id);
    });

    // A plain `function`, not an arrow — production code constructs this
    // with `new AudioCtx()`, and `new` on an arrow-backed vi.fn() silently
    // fails to attach the mocked instance methods.
    AudioContextCtor = vi.fn(function () {
      lastCtx = makeFakeAudioContext();
      return lastCtx;
    });
    vi.stubGlobal("AudioContext", AudioContextCtor);

    getTTSProviderMock = vi.fn();
    vi.doMock("./tts", () => ({ getTTSProvider: getTTSProviderMock }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.doUnmock("./tts");
  });

  async function loadModule() {
    return import("./ttsAmplitude");
  }

  /** Fires whatever rAF callback is currently pending (the module always
   * re-arms one at the end of every tick, mirroring the real browser
   * loop) — this is how the test advances the module's internal clock. */
  function fireNextFrame() {
    const cb = rafCallback;
    rafCallback = null;
    cb?.(0);
  }

  it("reports amplitude 0 while nothing is playing", async () => {
    getTTSProviderMock.mockReturnValue({ currentAudioElement: () => null });
    const { subscribeTTSAmplitude } = await loadModule();
    const listener = vi.fn();
    subscribeTTSAmplitude("azure", listener);
    fireNextFrame();
    expect(listener).toHaveBeenCalledWith(0);
    expect(AudioContextCtor).not.toHaveBeenCalled();
  });

  it("builds an analyser graph for a newly-playing audio element and reports its amplitude", async () => {
    const fakeEl = {} as HTMLAudioElement;
    getTTSProviderMock.mockReturnValue({ currentAudioElement: () => fakeEl });
    const { subscribeTTSAmplitude } = await loadModule();
    const listener = vi.fn();
    subscribeTTSAmplitude("azure", listener);

    expect(AudioContextCtor).toHaveBeenCalledTimes(1);
    expect(lastCtx?.createMediaElementSource).toHaveBeenCalledWith(fakeEl);

    fireNextFrame();
    const [amplitude] = listener.mock.calls.at(-1) as [number];
    expect(amplitude).toBeCloseTo(128 / 255, 5);
  });

  it("connects the analyser through to the destination so playback is never silenced", async () => {
    const fakeEl = {} as HTMLAudioElement;
    getTTSProviderMock.mockReturnValue({ currentAudioElement: () => fakeEl });
    const { subscribeTTSAmplitude } = await loadModule();
    subscribeTTSAmplitude("azure", vi.fn());

    const analyser = lastCtx?.createAnalyser.mock.results[0]?.value;
    expect(analyser.connect).toHaveBeenCalledWith(lastCtx?.destination);
  });

  it("reuses the same graph across multiple ticks for the same element", async () => {
    const fakeEl = {} as HTMLAudioElement;
    getTTSProviderMock.mockReturnValue({ currentAudioElement: () => fakeEl });
    const { subscribeTTSAmplitude } = await loadModule();
    subscribeTTSAmplitude("azure", vi.fn());
    fireNextFrame();
    fireNextFrame();
    fireNextFrame();
    expect(AudioContextCtor).toHaveBeenCalledTimes(1);
  });

  it("rebuilds the graph and closes the previous context when the audio element changes", async () => {
    const el1 = {} as HTMLAudioElement;
    const el2 = {} as HTMLAudioElement;
    let current = el1;
    getTTSProviderMock.mockReturnValue({ currentAudioElement: () => current });
    const { subscribeTTSAmplitude } = await loadModule();
    subscribeTTSAmplitude("azure", vi.fn());
    const firstCtx = lastCtx;

    current = el2;
    fireNextFrame();

    expect(AudioContextCtor).toHaveBeenCalledTimes(2);
    expect(firstCtx?.close).toHaveBeenCalledTimes(1);
    expect(lastCtx?.createMediaElementSource).toHaveBeenCalledWith(el2);
  });

  it("keeps the audio graph alive while at least one subscriber remains", async () => {
    const fakeEl = {} as HTMLAudioElement;
    getTTSProviderMock.mockReturnValue({ currentAudioElement: () => fakeEl });
    const { subscribeTTSAmplitude } = await loadModule();
    const unsubA = subscribeTTSAmplitude("azure", vi.fn());
    const unsubB = subscribeTTSAmplitude("azure", vi.fn());
    const ctx = lastCtx;

    unsubA();
    expect(ctx?.close).not.toHaveBeenCalled();

    unsubB();
    expect(ctx?.close).toHaveBeenCalledTimes(1);
  });

  it("cancels the animation frame loop once the last subscriber unsubscribes", async () => {
    getTTSProviderMock.mockReturnValue({ currentAudioElement: () => null });
    const { subscribeTTSAmplitude } = await loadModule();
    const unsub = subscribeTTSAmplitude("azure", vi.fn());
    const pendingRafId = nextRafId - 1;

    unsub();
    expect(rafCancelled).toContain(pendingRafId);

    // Nothing should still be listening — firing whatever callback was
    // captured before teardown must not throw or resurrect the loop.
    expect(() => fireNextFrame()).not.toThrow();
  });

  it("degrades to amplitude 0 without throwing when Web Audio is unavailable", async () => {
    const fakeEl = {} as HTMLAudioElement;
    getTTSProviderMock.mockReturnValue({ currentAudioElement: () => fakeEl });
    AudioContextCtor.mockImplementation(function () {
      throw new Error("Web Audio unavailable in this environment");
    });
    const { subscribeTTSAmplitude } = await loadModule();
    const listener = vi.fn();
    expect(() => subscribeTTSAmplitude("azure", listener)).not.toThrow();
    fireNextFrame();
    expect(listener).toHaveBeenCalledWith(0);
  });

  it("passes the requested provider id through to getTTSProvider", async () => {
    getTTSProviderMock.mockReturnValue({ currentAudioElement: () => null });
    const { subscribeTTSAmplitude } = await loadModule();
    subscribeTTSAmplitude("elevenlabs", vi.fn());
    expect(getTTSProviderMock).toHaveBeenCalledWith("elevenlabs");
  });
});
