import { describe, it, expect, vi } from "vitest";
import { WakeFeaturePipeline, WakeDetectionGate, type WakeModelRunner } from "./featurePipeline";
import { WAKE_MODEL, WAKE_WARMUP_MEL_FRAMES } from "@/config/voice";

/**
 * A stand-in for the three ONNX models that keeps the real shapes but
 * makes outputs predictable, so these tests exercise the buffering math
 * (where the off-by-ones actually are) rather than the models.
 */
function fakeRunner(scoreFor: (callIndex: number) => number = () => 0): WakeModelRunner & {
  melCalls: number;
  embCalls: number;
  clsCalls: number;
  lastEmbeddingWindow: Float32Array | null;
  lastClassifierWindow: Float32Array | null;
} {
  const state = {
    melCalls: 0,
    embCalls: 0,
    clsCalls: 0,
    lastEmbeddingWindow: null as Float32Array | null,
    lastClassifierWindow: null as Float32Array | null,
    async melspectrogram(frame: Float32Array) {
      expect(frame.length).toBe(WAKE_MODEL.frameSamples);
      state.melCalls++;
      // Real model emits 5 frames x 32 bins per chunk.
      return new Float32Array(WAKE_MODEL.melFramesPerChunk * WAKE_MODEL.melBins).fill(state.melCalls);
    },
    async embedding(window: Float32Array) {
      state.embCalls++;
      state.lastEmbeddingWindow = window;
      return new Float32Array(WAKE_MODEL.embeddingDim).fill(state.embCalls);
    },
    async classify(window: Float32Array) {
      state.clsCalls++;
      state.lastClassifierWindow = window;
      return scoreFor(state.clsCalls);
    },
  };
  return state;
}

const CHUNK = () => new Float32Array(WAKE_MODEL.frameSamples);

/** Chunks needed before the first score can exist. */
const CHUNKS_TO_WARM = Math.ceil(WAKE_WARMUP_MEL_FRAMES / WAKE_MODEL.melFramesPerChunk);

describe("WakeFeaturePipeline", () => {
  it("feeds the embedding model exactly a 76x32 window", async () => {
    const runner = fakeRunner();
    const pipeline = new WakeFeaturePipeline(runner);
    // 76 mel frames need ceil(76/5) = 16 chunks.
    for (let i = 0; i < 16; i++) await pipeline.process(CHUNK());
    expect(runner.embCalls).toBeGreaterThan(0);
    expect(runner.lastEmbeddingWindow!.length).toBe(WAKE_MODEL.embeddingWindow * WAKE_MODEL.melBins);
  });

  it("feeds the classifier exactly a 16x96 window", async () => {
    const runner = fakeRunner();
    const pipeline = new WakeFeaturePipeline(runner);
    for (let i = 0; i < CHUNKS_TO_WARM + 2; i++) await pipeline.process(CHUNK());
    expect(runner.clsCalls).toBeGreaterThan(0);
    expect(runner.lastClassifierWindow!.length).toBe(
      WAKE_MODEL.classifierWindow * WAKE_MODEL.embeddingDim
    );
  });

  it("produces no score before the warmup window has elapsed", async () => {
    const runner = fakeRunner();
    const pipeline = new WakeFeaturePipeline(runner);
    let total = 0;
    for (let i = 0; i < CHUNKS_TO_WARM - 1; i++) {
      const { scores, warmedUp } = await pipeline.process(CHUNK());
      total += scores.length;
      expect(warmedUp).toBe(false);
    }
    // This is the exact bug the Node verification caught: too little
    // audio silently produces zero scores rather than an error.
    expect(total).toBe(0);
  });

  it("reports warmedUp and starts scoring once enough audio has arrived", async () => {
    const runner = fakeRunner();
    const pipeline = new WakeFeaturePipeline(runner);
    let total = 0;
    let warm = false;
    for (let i = 0; i < CHUNKS_TO_WARM + 4; i++) {
      const r = await pipeline.process(CHUNK());
      total += r.scores.length;
      warm = warm || r.warmedUp;
    }
    expect(warm).toBe(true);
    expect(total).toBeGreaterThan(0);
  });

  it("advances the embedding window by exactly the configured step", async () => {
    const runner = fakeRunner();
    const pipeline = new WakeFeaturePipeline(runner);
    for (let i = 0; i < 40; i++) await pipeline.process(CHUNK());
    // With step 8 over N mel frames, embeddings ≈ floor((N-76)/8)+1.
    const melFrames = 40 * WAKE_MODEL.melFramesPerChunk;
    const expected = Math.floor((melFrames - WAKE_MODEL.embeddingWindow) / WAKE_MODEL.embeddingStep) + 1;
    expect(runner.embCalls).toBe(expected);
  });

  it("bounds memory during indefinite listening", async () => {
    const runner = fakeRunner();
    const pipeline = new WakeFeaturePipeline(runner);
    for (let i = 0; i < 400; i++) await pipeline.process(CHUNK());
    // Reach into internals deliberately: unbounded growth here is the
    // classic always-on leak, and asserting the public API alone would
    // not catch it.
    const internals = pipeline as unknown as { melBuffer: number[]; embeddings: Float32Array[] };
    expect(internals.melBuffer.length).toBeLessThan(WAKE_MODEL.embeddingWindow * WAKE_MODEL.melBins * 4);
    expect(internals.embeddings.length).toBeLessThanOrEqual(WAKE_MODEL.classifierWindow * 2);
  });

  it("still scores correctly after trimming has kicked in", async () => {
    const runner = fakeRunner(() => 0.9);
    const pipeline = new WakeFeaturePipeline(runner);
    let late = 0;
    for (let i = 0; i < 300; i++) {
      const r = await pipeline.process(CHUNK());
      if (i > 250) late += r.scores.length;
    }
    // Trimming must not stall the sliding window.
    expect(late).toBeGreaterThan(0);
  });

  it("reset() clears state so a restart never scores against pre-pause audio", async () => {
    const runner = fakeRunner();
    const pipeline = new WakeFeaturePipeline(runner);
    for (let i = 0; i < CHUNKS_TO_WARM + 2; i++) await pipeline.process(CHUNK());
    pipeline.reset();
    const { scores, warmedUp } = await pipeline.process(CHUNK());
    expect(scores).toHaveLength(0);
    expect(warmedUp).toBe(false);
  });
});

describe("WakeDetectionGate (false-activation protection)", () => {
  it("ignores scores below the threshold", () => {
    const gate = new WakeDetectionGate(0.5, 2000);
    expect(gate.accept(0.49)).toBe(false);
    expect(gate.accept(0.0)).toBe(false);
  });

  it("accepts a score at or above the threshold", () => {
    const gate = new WakeDetectionGate(0.5, 2000);
    expect(gate.accept(0.5)).toBe(true);
  });

  it("debounces the repeated high scores one utterance produces", () => {
    // The real failure mode: a single "Hey JARVIS" sits in the ~3s
    // classifier context for dozens of consecutive 80ms frames.
    let now = 1000;
    const gate = new WakeDetectionGate(0.5, 2000, () => now);
    expect(gate.accept(0.9)).toBe(true);
    let extra = 0;
    // 20 frames x 80ms = 1600ms, deliberately inside the 2000ms debounce.
    for (let i = 0; i < 20; i++) {
      now += 80;
      if (gate.accept(0.9)) extra++;
    }
    expect(extra).toBe(0);
  });

  it("does not suppress forever — a fresh utterance after the window fires again", () => {
    let now = 1000;
    const gate = new WakeDetectionGate(0.5, 2000, () => now);
    expect(gate.accept(0.9)).toBe(true);
    let fired = 0;
    // 30 frames x 80ms = 2400ms, deliberately crossing the debounce.
    for (let i = 0; i < 30; i++) {
      now += 80;
      if (gate.accept(0.9)) fired++;
    }
    expect(fired).toBe(1);
  });

  it("allows a genuinely new activation once the debounce has elapsed", () => {
    let now = 1000;
    const gate = new WakeDetectionGate(0.5, 2000, () => now);
    expect(gate.accept(0.9)).toBe(true);
    now += 2100;
    expect(gate.accept(0.9)).toBe(true);
  });

  it("honours a threshold change at runtime", () => {
    let now = 1000;
    const gate = new WakeDetectionGate(0.9, 0, () => now);
    expect(gate.accept(0.6)).toBe(false);
    gate.setThreshold(0.5);
    now += 10;
    expect(gate.accept(0.6)).toBe(true);
  });

  it("reset() lets a deliberate restart fire immediately", () => {
    let now = 1000;
    const gate = new WakeDetectionGate(0.5, 5000, () => now);
    expect(gate.accept(0.9)).toBe(true);
    now += 100;
    expect(gate.accept(0.9)).toBe(false);
    gate.reset();
    expect(gate.accept(0.9)).toBe(true);
  });
});

describe("model constants", () => {
  it("warmup matches the verified 76 + 8*(16-1) = 196 mel frames", () => {
    expect(WAKE_WARMUP_MEL_FRAMES).toBe(196);
  });

  it("keeps the frame size openWakeWord actually requires", () => {
    expect(WAKE_MODEL.frameSamples).toBe(1280);
    expect(WAKE_MODEL.sampleRate).toBe(16000);
  });
});

describe("pipeline resilience", () => {
  it("propagates a model failure instead of silently scoring zero", async () => {
    const runner = fakeRunner();
    runner.melspectrogram = vi.fn().mockRejectedValue(new Error("ONNX session failed"));
    const pipeline = new WakeFeaturePipeline(runner);
    // A failed model must surface, so the engine can report the fault
    // rather than appear to be listening while detecting nothing.
    await expect(pipeline.process(CHUNK())).rejects.toThrow(/ONNX session failed/);
  });
});
