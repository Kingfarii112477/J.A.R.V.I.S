/**
 * Centralized voice/wake-word configuration.
 *
 * Every magic number the continuous-listening pipeline depends on lives
 * here rather than scattered through the audio code. The MODEL_* values
 * are not tunable preferences — they are hard requirements of the
 * openWakeWord ONNX graphs, verified empirically by running the real
 * models (see the Phase 8 notes in README). Changing them breaks
 * inference rather than adjusting behaviour, which is why they're
 * grouped separately from the tunables below.
 */

/** Fixed properties of the openWakeWord model chain. Do not tune. */
export const WAKE_MODEL = {
  /** openWakeWord expects 16-bit 16 kHz mono PCM. */
  sampleRate: 16000,
  /** 80 ms per inference chunk — the framework's documented frame size. */
  frameSamples: 1280,
  /** Mel bins produced by melspectrogram.onnx. */
  melBins: 32,
  /** Mel frames produced per 1280-sample chunk (measured: output was
   * (1,1,5,32) for one chunk). */
  melFramesPerChunk: 5,
  /** Mel frames the embedding model consumes per embedding. */
  embeddingWindow: 76,
  /** Mel frames the embedding window advances between embeddings. */
  embeddingStep: 8,
  /** Dimensionality of one embedding. */
  embeddingDim: 96,
  /** Embeddings the classifier consumes per score. */
  classifierWindow: 16,
} as const;

/**
 * Audio context required before the first score can be produced:
 * 76 + 8*(16-1) = 196 mel frames ≈ 3.14 s. Surfaced because it's the
 * reason a freshly-started detector is briefly "warming up" rather than
 * broken, and the UI should not report a fault during that window.
 */
export const WAKE_WARMUP_MEL_FRAMES =
  WAKE_MODEL.embeddingWindow + WAKE_MODEL.embeddingStep * (WAKE_MODEL.classifierWindow - 1);

export const WAKE_WARMUP_MS = Math.round(
  (WAKE_WARMUP_MEL_FRAMES / WAKE_MODEL.melFramesPerChunk) * (WAKE_MODEL.frameSamples / WAKE_MODEL.sampleRate) * 1000
);

/** Tunable behaviour. These are real defaults, overridable from settings. */
export const VOICE_DEFAULTS = {
  /** Score above which a detection counts. Measured non-speech scores
   * were ~1e-5, so 0.5 leaves an enormous margin against false wakes
   * while staying well inside the model's confident range. */
  wakeWordThreshold: 0.5,
  /** Ignore further detections for this long after one fires. A single
   * spoken phrase stays in the classifier's ~3 s context window for many
   * consecutive frames and would otherwise re-trigger every 80 ms. */
  wakeWordDebounceMs: 2000,
  /** How long to wait for the user to start speaking a command before
   * giving up and returning to wake-word listening. */
  commandTimeoutMs: 8000,
  /** Silence that ends an utterance once speech has been detected. */
  silenceTimeoutMs: 1500,
  /** Hard cap on a single command recording. */
  maxCommandDurationMs: 15000,
  /** After a response, how long to keep accepting follow-ups without
   * requiring the wake phrase again. */
  conversationTimeoutMs: 6000,
} as const;

/** Where the model files are served from in the web build. */
export const WAKE_MODEL_PATHS = {
  melspectrogram: "/models/wakeword/melspectrogram.onnx",
  embedding: "/models/wakeword/embedding_model.onnx",
  detector: "/models/wakeword/hey_jarvis_v0.1.onnx",
} as const;

export const WAKE_PHRASE_LABEL = "Hey JARVIS";
