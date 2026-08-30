import { WAKE_MODEL, WAKE_WARMUP_MEL_FRAMES } from "@/config/voice";

/**
 * The openWakeWord streaming feature pipeline, as pure buffering logic.
 *
 * openWakeWord is three chained models, each consuming a different-sized
 * window, so the hard part is not inference — it's keeping the sliding
 * windows aligned as 80 ms chunks arrive:
 *
 *   1280 audio samples
 *     -> melspectrogram            -> 5 mel frames x 32 bins
 *     -> (v/10)+2 transform
 *     -> sliding window of 76 mel frames, advancing 8 at a time
 *        -> embedding             -> 96 dims
 *     -> sliding window of 16 embeddings
 *        -> classifier            -> one score
 *
 * All model shapes and the transform were verified by running the real
 * ONNX files rather than assumed (see config/voice.ts).
 *
 * The three model calls are injected as [WakeModelRunner] so this class
 * — which holds every off-by-one that actually matters — is unit
 * testable with no ONNX runtime, on any platform. The web and Android
 * engines each supply their own runner over the same logic.
 */
export interface WakeModelRunner {
  /** 1280 float samples -> flat mel values, row-major [frames][32].
   * Implementations must already have applied the (v/10)+2 transform. */
  melspectrogram(frame: Float32Array): Promise<Float32Array>;
  /** 76*32 mel values -> 96-dim embedding. */
  embedding(window: Float32Array): Promise<Float32Array>;
  /** 16*96 embedding values -> single score in 0..1. */
  classify(window: Float32Array): Promise<number>;
}

export interface FeaturePipelineResult {
  /** Scores produced by this chunk. Usually 0 or 1; can be more if a
   * caller submits a larger-than-standard chunk. */
  scores: number[];
  /** False until enough audio has accumulated for the first real score.
   * A detector in warmup is not broken and must not be reported as such. */
  warmedUp: boolean;
}

export class WakeFeaturePipeline {
  /** Flat mel ring: melBuffer[i*melBins + b]. A flat array avoids
   * allocating a sub-array per frame in the hot path. */
  private melBuffer: number[] = [];
  private embeddings: Float32Array[] = [];
  /** Index (in mel frames) of the next embedding window's start. */
  private windowPos = 0;
  /** Mel frames dropped from the front of melBuffer, so windowPos stays
   * meaningful after trimming. */
  private melDropped = 0;

  constructor(private readonly runner: WakeModelRunner) {}

  /** Total mel frames seen, used for the warmup check. */
  private get totalMelFrames(): number {
    return this.melDropped + this.melBuffer.length / WAKE_MODEL.melBins;
  }

  /**
   * Feeds one chunk of audio (normally [WAKE_MODEL.frameSamples]) and
   * returns any scores it produced.
   */
  async process(frame: Float32Array): Promise<FeaturePipelineResult> {
    const mel = await this.runner.melspectrogram(frame);
    for (let i = 0; i < mel.length; i++) this.melBuffer.push(mel[i]);

    const scores: number[] = [];
    const { embeddingWindow, embeddingStep, melBins, classifierWindow, embeddingDim } = WAKE_MODEL;

    // Emit every embedding whose full 76-frame window has now arrived.
    for (;;) {
      const startFrame = this.windowPos - this.melDropped;
      const needed = (startFrame + embeddingWindow) * melBins;
      if (startFrame < 0 || needed > this.melBuffer.length) break;

      const window = new Float32Array(embeddingWindow * melBins);
      for (let i = 0; i < window.length; i++) window[i] = this.melBuffer[startFrame * melBins + i];

      this.embeddings.push(await this.runner.embedding(window));
      this.windowPos += embeddingStep;

      if (this.embeddings.length >= classifierWindow) {
        const stack = new Float32Array(classifierWindow * embeddingDim);
        const first = this.embeddings.length - classifierWindow;
        for (let e = 0; e < classifierWindow; e++) {
          stack.set(this.embeddings[first + e], e * embeddingDim);
        }
        scores.push(await this.runner.classify(stack));
      }
    }

    this.trim();
    return { scores, warmedUp: this.totalMelFrames >= WAKE_WARMUP_MEL_FRAMES };
  }

  /**
   * Bounds memory during indefinite listening. Keeps only the mel frames
   * a future window could still need, and only the embeddings the
   * classifier window can still reach — without this, an always-on
   * detector grows unboundedly, which is precisely the kind of leak that
   * makes continuous listening unshippable.
   */
  private trim() {
    const { embeddingWindow, melBins, classifierWindow } = WAKE_MODEL;
    const keepFrom = this.windowPos - this.melDropped;
    if (keepFrom > embeddingWindow) {
      const drop = keepFrom - embeddingWindow;
      this.melBuffer.splice(0, drop * melBins);
      this.melDropped += drop;
    }
    if (this.embeddings.length > classifierWindow * 2) {
      this.embeddings.splice(0, this.embeddings.length - classifierWindow);
    }
  }

  /** Clears all state — used when detection stops, so a restart never
   * scores against audio from before the pause. */
  reset() {
    this.melBuffer = [];
    this.embeddings = [];
    this.windowPos = 0;
    this.melDropped = 0;
  }
}

/**
 * False-activation protection, kept separate from the pipeline so it can
 * be reasoned about (and tested) on its own.
 *
 * The debounce is not cosmetic: one spoken "Hey JARVIS" stays inside the
 * classifier's ~3 s context for dozens of consecutive 80 ms frames, so
 * without it a single utterance fires a detection roughly every 80 ms.
 */
export class WakeDetectionGate {
  /** -Infinity, not 0: with a plain 0 the very first detection gets
   * debounced against a phantom firing at the epoch, silently swallowing
   * the user's first "Hey JARVIS" after every start. */
  private lastFiredAt = Number.NEGATIVE_INFINITY;
  private aboveThresholdSince: number | null = null;

  constructor(
    private threshold: number,
    private debounceMs: number,
    private readonly now: () => number = () => Date.now()
  ) {}

  setThreshold(value: number) {
    this.threshold = value;
  }

  setDebounce(ms: number) {
    this.debounceMs = ms;
  }

  /** Returns true only when this score should count as a real, new
   * activation. */
  accept(score: number): boolean {
    const t = this.now();
    if (score < this.threshold) {
      this.aboveThresholdSince = null;
      return false;
    }
    if (this.aboveThresholdSince === null) this.aboveThresholdSince = t;
    if (t - this.lastFiredAt < this.debounceMs) return false;
    this.lastFiredAt = t;
    return true;
  }

  /** Clears debounce state so a deliberate restart can fire immediately. */
  reset() {
    this.lastFiredAt = Number.NEGATIVE_INFINITY;
    this.aboveThresholdSince = null;
  }
}
