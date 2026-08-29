import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { containsWakePhrase, disabledWakeWordProvider, foregroundKeywordWakeWordProvider, getWakeWordProvider } from "./wakeWord";

describe("containsWakePhrase", () => {
  it("matches the bare wake word", () => {
    expect(containsWakePhrase("jarvis")).toBe(true);
  });

  it("matches case-insensitively and mid-sentence", () => {
    expect(containsWakePhrase("Okay Jarvis, run diagnostics")).toBe(true);
  });

  it("matches common phrasing variants", () => {
    expect(containsWakePhrase("hey jarvis what's the time")).toBe(true);
    expect(containsWakePhrase("ok jarvis")).toBe(true);
  });

  it("does not match unrelated speech", () => {
    expect(containsWakePhrase("what's the weather like today")).toBe(false);
  });

  it("does not match a word that merely contains similar letters", () => {
    expect(containsWakePhrase("harvest season is here")).toBe(false);
  });
});

describe("disabledWakeWordProvider", () => {
  it("is never supported and start() is a safe no-op", () => {
    expect(disabledWakeWordProvider.isSupported()).toBe(false);
    expect(() => disabledWakeWordProvider.start(() => {})).not.toThrow();
  });
});

class FakeSpeechRecognition implements Partial<SpeechRecognitionLike> {
  lang = "";
  continuous = false;
  interimResults = false;
  maxAlternatives = 1;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null = null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null = null;
  onend: (() => void) | null = null;
  onstart: (() => void) | null = null;
  started = false;
  start = vi.fn(() => {
    this.started = true;
  });
  stop = vi.fn();
  abort = vi.fn();
}

function fakeResult(transcript: string): SpeechRecognitionEventLike {
  return {
    resultIndex: 0,
    results: { length: 1, 0: { isFinal: true, length: 1, 0: { transcript, confidence: 0.9 } } },
  } as unknown as SpeechRecognitionEventLike;
}

describe("foregroundKeywordWakeWordProvider", () => {
  let instances: FakeSpeechRecognition[] = [];

  beforeEach(() => {
    vi.useFakeTimers();
    instances = [];
    vi.stubGlobal(
      "window",
      Object.assign(globalThis.window ?? {}, {
        SpeechRecognition: vi.fn(function (this: FakeSpeechRecognition) {
          const instance = new FakeSpeechRecognition();
          instances.push(instance);
          return instance;
        }),
      })
    );
  });

  afterEach(() => {
    foregroundKeywordWakeWordProvider.stop();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("reports supported when SpeechRecognition exists on window", () => {
    expect(foregroundKeywordWakeWordProvider.isSupported()).toBe(true);
  });

  it("starts a recognition session immediately on start()", () => {
    foregroundKeywordWakeWordProvider.start(vi.fn());
    expect(instances).toHaveLength(1);
    expect(instances[0].started).toBe(true);
  });

  it("fires onWake and does not restart when the wake phrase is heard", () => {
    const onWake = vi.fn();
    foregroundKeywordWakeWordProvider.start(onWake);
    instances[0].onresult?.(fakeResult("hey jarvis"));
    expect(onWake).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1000);
    expect(instances).toHaveLength(1); // no second session started
  });

  it("restarts the recognition cycle when no wake phrase was heard", () => {
    foregroundKeywordWakeWordProvider.start(vi.fn());
    instances[0].onresult?.(fakeResult("what time is it"));
    vi.advanceTimersByTime(300);
    expect(instances).toHaveLength(2);
  });

  it("restarts on a routine no-speech error without calling onError", () => {
    const onError = vi.fn();
    foregroundKeywordWakeWordProvider.start(vi.fn(), onError);
    instances[0].onerror?.({ error: "no-speech" } as SpeechRecognitionErrorEventLike);
    vi.advanceTimersByTime(300);
    expect(onError).not.toHaveBeenCalled();
    expect(instances).toHaveLength(2);
  });

  it("surfaces a genuine error via onError and still restarts", () => {
    const onError = vi.fn();
    foregroundKeywordWakeWordProvider.start(vi.fn(), onError);
    instances[0].onerror?.({ error: "audio-capture" } as SpeechRecognitionErrorEventLike);
    expect(onError).toHaveBeenCalledWith(expect.stringContaining("audio-capture"));
    vi.advanceTimersByTime(300);
    expect(instances).toHaveLength(2);
  });

  it("stop() aborts the active session and prevents further restarts", () => {
    foregroundKeywordWakeWordProvider.start(vi.fn());
    foregroundKeywordWakeWordProvider.stop();
    expect(instances[0].abort).toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(instances).toHaveLength(1); // never restarted after stop
  });

  it("calling start() twice without stop() does not open a second session", () => {
    foregroundKeywordWakeWordProvider.start(vi.fn());
    foregroundKeywordWakeWordProvider.start(vi.fn());
    expect(instances).toHaveLength(1);
  });
});

describe("getWakeWordProvider", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the foreground keyword provider when SpeechRecognition is supported", () => {
    vi.stubGlobal("window", Object.assign(globalThis.window ?? {}, { SpeechRecognition: vi.fn() }));
    expect(getWakeWordProvider().id).toBe("foreground-keyword");
  });

  it("falls back to the disabled provider when unsupported", () => {
    const w = Object.assign({}, globalThis.window ?? {});
    delete (w as { SpeechRecognition?: unknown }).SpeechRecognition;
    delete (w as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition;
    vi.stubGlobal("window", w);
    expect(getWakeWordProvider().id).toBe("disabled");
  });
});
