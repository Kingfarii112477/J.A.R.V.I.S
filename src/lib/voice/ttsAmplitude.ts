import { getTTSProvider } from "./tts";
import type { JarvisSettings } from "@/types/jarvis";

type Listener = (amplitude: number) => void;
type TTSProviderId = JarvisSettings["ttsProvider"];

let audioCtx: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let dataArray: Uint8Array<ArrayBuffer> | null = null;
let sourceEl: HTMLAudioElement | null = null;
let rafId: number | null = null;
let frameSkip = 0;
let providerId: TTSProviderId = "browser";
const listeners = new Set<Listener>();

function teardownGraph() {
  if (rafId !== null) cancelAnimationFrame(rafId);
  rafId = null;
  audioCtx?.close().catch(() => {});
  audioCtx = null;
  analyser = null;
  dataArray = null;
  sourceEl = null;
}

/** Rebuilds the analyser graph whenever the actively-playing <audio>
 * element changes identity (ServerTTSProvider constructs a fresh element
 * per speak() call — see its currentAudioElement() comment). Connecting
 * the analyser through to ctx.destination is required, not optional:
 * createMediaElementSource() reroutes the element's output into the Web
 * Audio graph, so skipping that connection would silently mute playback. */
function attachTo(el: HTMLAudioElement) {
  audioCtx?.close().catch(() => {});
  audioCtx = null;
  analyser = null;
  dataArray = null;
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    const ctx = new AudioCtx();
    const source = ctx.createMediaElementSource(el);
    const node = ctx.createAnalyser();
    node.fftSize = 64;
    node.smoothingTimeConstant = 0.6;
    source.connect(node);
    node.connect(ctx.destination);
    audioCtx = ctx;
    analyser = node;
    dataArray = new Uint8Array(node.frequencyBinCount);
  } catch {
    // Web Audio unavailable, or this element was already wired up
    // elsewhere — degrade to a flat 0 amplitude rather than throwing.
  }
  sourceEl = el;
}

function tick() {
  const el = getTTSProvider(providerId).currentAudioElement?.() ?? null;
  if (el && el !== sourceEl) attachTo(el);
  else if (!el) sourceEl = null;

  // Matches useVoice.ts's tickLevels() throttling convention: halving the
  // update rate keeps this smooth without pushing a React re-render on
  // every one of the loop's 60fps ticks.
  frameSkip = (frameSkip + 1) % 2;
  if (frameSkip === 0) {
    let amplitude = 0;
    if (analyser && dataArray) {
      analyser.getByteFrequencyData(dataArray);
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
      amplitude = sum / dataArray.length / 255;
    }
    listeners.forEach((fn) => fn(amplitude));
  }
  rafId = requestAnimationFrame(tick);
}

/**
 * Subscribes to the shared TTS-playback amplitude signal (0..1), driving
 * JarvisCore's speaking-state pulse from real audio energy instead of a
 * fixed animation. A single module-level AudioContext/AnalyserNode is
 * reused across every subscriber (any number of simultaneously-mounted
 * JarvisCore instances — e.g. Settings open over the Voice screen): a
 * MediaElementSourceNode can only ever be created once per <audio>
 * element, so this must stay a singleton rather than something each
 * component builds for itself. Flat 0 whenever nothing is playing or the
 * active provider is the browser SpeechSynthesis fallback, which exposes
 * no analysable audio element — callers degrade to their fixed animation
 * in that case, never breaking. Returns an unsubscribe function; the
 * underlying rAF loop and AudioContext are torn down once the last
 * subscriber leaves, so nothing is left running while nobody is speaking.
 */
export function subscribeTTSAmplitude(ttsProvider: TTSProviderId, listener: Listener): () => void {
  providerId = ttsProvider;
  listeners.add(listener);
  if (listeners.size === 1) tick();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) teardownGraph();
  };
}
