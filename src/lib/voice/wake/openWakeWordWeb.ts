"use client";

import * as ort from "onnxruntime-web";
import { WAKE_MODEL, WAKE_MODEL_PATHS, VOICE_DEFAULTS } from "@/config/voice";
import { WakeFeaturePipeline, WakeDetectionGate, type WakeModelRunner } from "./featurePipeline";

/**
 * Browser wake-word detection using openWakeWord's ONNX models.
 *
 * Runs entirely in the browser: the microphone stream never leaves the
 * device during standby, and no server is contacted for detection. Only
 * the command the user speaks AFTER the wake phrase goes through the
 * existing STT pipeline.
 *
 * MODEL LICENSING: the openWakeWord *code* is Apache 2.0, but the
 * pre-trained models bundled under public/models/wakeword/ are
 * CC BY-NC-SA 4.0 (NonCommercial) because of their training data. That
 * is fine for personal and non-commercial use and is a real constraint
 * on commercial distribution — see the README.
 */

export type WebWakeStatus =
  | "idle"
  | "loading-models"
  | "requesting-microphone"
  | "warming-up"
  | "listening"
  | "error";

export interface WebWakeWordHandlers {
  onWake: () => void;
  onStatus: (status: WebWakeStatus, detail?: string) => void;
  onError: (message: string) => void;
}

/** Reasons detection genuinely cannot run, phrased for a user. */
function describeStartFailure(err: unknown): string {
  const name = err instanceof Error ? err.name : "";
  const message = err instanceof Error ? err.message : String(err);
  if (name === "NotAllowedError" || /permission/i.test(message)) {
    return "Microphone access was denied. Wake-word listening needs the microphone — enable it in your browser's site settings.";
  }
  if (name === "NotFoundError") {
    return "No microphone was found on this device, so wake-word listening can't run.";
  }
  if (name === "NotReadableError") {
    return "The microphone is in use by another application, so wake-word listening can't start.";
  }
  return `Wake-word listening could not start: ${message}`;
}

export class OpenWakeWordWebEngine {
  private session: {
    mel: ort.InferenceSession;
    emb: ort.InferenceSession;
    det: ort.InferenceSession;
  } | null = null;

  private stream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private processor: ScriptProcessorNode | null = null;
  private pipeline: WakeFeaturePipeline | null = null;
  private gate: WakeDetectionGate;
  private running = false;
  /** Guards against overlapping inference when a chunk arrives while the
   * previous one is still running — without this, concurrent runs corrupt
   * the sliding-window state. */
  private busy = false;
  private carry: number[] = [];
  private handlers: WebWakeWordHandlers | null = null;

  constructor(
    threshold: number = VOICE_DEFAULTS.wakeWordThreshold,
    debounceMs: number = VOICE_DEFAULTS.wakeWordDebounceMs
  ) {
    this.gate = new WakeDetectionGate(threshold, debounceMs);
  }

  static isSupported(): boolean {
    if (typeof window === "undefined") return false;
    const hasMedia = Boolean(navigator?.mediaDevices?.getUserMedia);
    const hasAudio = typeof window.AudioContext !== "undefined" || typeof window.webkitAudioContext !== "undefined";
    // getUserMedia requires a secure context; on http:// it simply isn't
    // there. Report that honestly rather than failing mysteriously later.
    const secure = window.isSecureContext !== false;
    return hasMedia && hasAudio && secure;
  }

  setThreshold(value: number) {
    this.gate.setThreshold(value);
  }

  setDebounce(ms: number) {
    this.gate.setDebounce(ms);
  }

  get isRunning(): boolean {
    return this.running;
  }

  async start(handlers: WebWakeWordHandlers): Promise<boolean> {
    if (this.running) return true;
    this.handlers = handlers;

    if (!OpenWakeWordWebEngine.isSupported()) {
      const reason =
        typeof window !== "undefined" && window.isSecureContext === false
          ? "Wake-word listening needs a secure (HTTPS) page — browsers only allow microphone access over HTTPS."
          : "This browser doesn't support the microphone APIs wake-word listening needs.";
      handlers.onStatus("error", reason);
      handlers.onError(reason);
      return false;
    }

    try {
      handlers.onStatus("loading-models");
      await this.loadModels();

      handlers.onStatus("requesting-microphone");
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      const Ctor = window.AudioContext || window.webkitAudioContext;
      // Ask for the model's rate directly; browsers that refuse fall back
      // to their native rate and we resample below.
      this.audioContext = new Ctor({ sampleRate: WAKE_MODEL.sampleRate });
      this.sourceNode = this.audioContext.createMediaStreamSource(this.stream);

      this.pipeline = new WakeFeaturePipeline(this.makeRunner());
      this.gate.reset();
      this.carry = [];

      // ScriptProcessorNode is deprecated but is the one path that works
      // without shipping a separate AudioWorklet module file, and its
      // known drawback (main-thread callbacks) is bounded here: the
      // callback only buffers samples, and inference is dispatched
      // asynchronously off the callback.
      const bufferSize = 4096;
      this.processor = this.audioContext.createScriptProcessor(bufferSize, 1, 1);
      this.processor.onaudioprocess = (event) => {
        if (!this.running) return;
        this.enqueue(event.inputBuffer.getChannelData(0), event.inputBuffer.sampleRate);
      };
      this.sourceNode.connect(this.processor);
      // Route to destination with zero gain: some browsers won't run a
      // ScriptProcessor that isn't connected to the graph's output, but
      // we must not actually play the microphone back to the user.
      const mute = this.audioContext.createGain();
      mute.gain.value = 0;
      this.processor.connect(mute);
      mute.connect(this.audioContext.destination);

      this.running = true;
      handlers.onStatus("warming-up");
      return true;
    } catch (err) {
      const message = describeStartFailure(err);
      handlers.onStatus("error", message);
      handlers.onError(message);
      await this.stop();
      return false;
    }
  }

  async stop(): Promise<void> {
    this.running = false;
    this.busy = false;
    this.carry = [];

    if (this.processor) {
      this.processor.onaudioprocess = null;
      try {
        this.processor.disconnect();
      } catch {
        /* already disconnected */
      }
      this.processor = null;
    }
    try {
      this.sourceNode?.disconnect();
    } catch {
      /* already disconnected */
    }
    this.sourceNode = null;

    // Releasing the tracks is what actually turns off the browser's
    // recording indicator — the visible proof we stopped listening.
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;

    if (this.audioContext) {
      try {
        await this.audioContext.close();
      } catch {
        /* already closed */
      }
      this.audioContext = null;
    }
    this.pipeline?.reset();
    this.pipeline = null;
    this.handlers?.onStatus("idle");
  }

  /** Frees the ONNX sessions too. Separate from stop() because reloading
   * ~3.7MB of models on every toggle would be wasteful. */
  async release(): Promise<void> {
    await this.stop();
    this.session = null;
  }

  private async loadModels() {
    if (this.session) return;
    // WASM backend only: WebGL/WebGPU add startup cost and device
    // variability for a model this small, and CPU is already ~1% of a
    // core for realtime audio (measured).
    ort.env.wasm.numThreads = 1;
    const opts: ort.InferenceSession.SessionOptions = {
      executionProviders: ["wasm"],
      graphOptimizationLevel: "all",
    };
    const [mel, emb, det] = await Promise.all([
      ort.InferenceSession.create(WAKE_MODEL_PATHS.melspectrogram, opts),
      ort.InferenceSession.create(WAKE_MODEL_PATHS.embedding, opts),
      ort.InferenceSession.create(WAKE_MODEL_PATHS.detector, opts),
    ]);
    this.session = { mel, emb, det };
  }

  /** Buffers incoming audio into exact model-sized frames, resampling if
   * the browser gave us a rate other than 16 kHz. */
  private enqueue(input: Float32Array, inputRate: number) {
    const samples =
      inputRate === WAKE_MODEL.sampleRate ? input : downsample(input, inputRate, WAKE_MODEL.sampleRate);
    for (let i = 0; i < samples.length; i++) this.carry.push(samples[i]);

    if (this.busy || this.carry.length < WAKE_MODEL.frameSamples) return;
    void this.drain();
  }

  private async drain() {
    if (this.busy || !this.pipeline) return;
    this.busy = true;
    try {
      while (this.running && this.carry.length >= WAKE_MODEL.frameSamples) {
        const frame = new Float32Array(this.carry.splice(0, WAKE_MODEL.frameSamples));
        const { scores, warmedUp } = await this.pipeline.process(frame);
        if (warmedUp) this.handlers?.onStatus("listening");
        for (const score of scores) {
          if (this.gate.accept(score)) {
            this.handlers?.onWake();
            // One activation per utterance: drop buffered audio so the
            // tail of the wake phrase can't immediately re-trigger.
            this.carry = [];
            this.pipeline.reset();
            break;
          }
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Wake-word inference failed.";
      this.handlers?.onStatus("error", message);
      this.handlers?.onError(`Wake-word detection stopped: ${message}`);
      await this.stop();
    } finally {
      this.busy = false;
    }
  }

  private makeRunner(): WakeModelRunner {
    const need = () => {
      if (!this.session) throw new Error("Wake-word models are not loaded.");
      return this.session;
    };
    return {
      melspectrogram: async (frame) => {
        const { mel } = need();
        const out = await mel.run({
          input: new ort.Tensor("float32", frame, [1, frame.length]),
        });
        const raw = out[mel.outputNames[0]].data as Float32Array;
        // openWakeWord's documented transform; without it the embedding
        // model receives values in the wrong range and scores are junk.
        const transformed = new Float32Array(raw.length);
        for (let i = 0; i < raw.length; i++) transformed[i] = raw[i] / 10 + 2;
        return transformed;
      },
      embedding: async (window) => {
        const { emb } = need();
        const out = await emb.run({
          input_1: new ort.Tensor("float32", window, [1, WAKE_MODEL.embeddingWindow, WAKE_MODEL.melBins, 1]),
        });
        return out[emb.outputNames[0]].data as Float32Array;
      },
      classify: async (window) => {
        const { det } = need();
        const out = await det.run({
          "x.1": new ort.Tensor("float32", window, [1, WAKE_MODEL.classifierWindow, WAKE_MODEL.embeddingDim]),
        });
        return (out[det.outputNames[0]].data as Float32Array)[0];
      },
    };
  }
}

/**
 * Linear-interpolation downsample. Adequate here because the mel
 * front-end is tolerant of mild resampling artefacts, and it avoids
 * pulling in a DSP dependency for one function.
 */
export function downsample(input: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate) return input;
  const ratio = fromRate / toRate;
  const length = Math.floor(input.length / ratio);
  const output = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const pos = i * ratio;
    const low = Math.floor(pos);
    const high = Math.min(low + 1, input.length - 1);
    const frac = pos - low;
    output[i] = input[low] * (1 - frac) + input[high] * frac;
  }
  return output;
}
