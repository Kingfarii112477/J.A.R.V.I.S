/**
 * Tiny synthesized sound engine — no shipped audio assets (per project
 * rules), everything is generated at runtime with the Web Audio API. Each
 * cue is a short oscillator blip/sweep. Volume and on/off come from
 * settings.soundEffects / settings.soundVolume.
 */
let ctx: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  return ctx;
}

interface ToneOptions {
  freq: number;
  duration: number;
  type?: OscillatorType;
  volume?: number;
  sweepTo?: number;
}

function playTone({ freq, duration, type = "sine", volume = 0.15, sweepTo }: ToneOptions, masterVolume: number) {
  const audioCtx = getContext();
  if (!audioCtx) return;
  if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});

  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
  if (sweepTo) {
    osc.frequency.exponentialRampToValueAtTime(sweepTo, audioCtx.currentTime + duration);
  }

  const finalVolume = volume * masterVolume;
  gain.gain.setValueAtTime(0.0001, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(Math.max(finalVolume, 0.0001), audioCtx.currentTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);

  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + duration + 0.02);
}

export type SoundCue = "boot-phase" | "boot-complete" | "click" | "notify" | "warning" | "listen-start" | "listen-end" | "error";

export function playSound(cue: SoundCue, enabled: boolean, volumePercent: number) {
  if (!enabled || typeof window === "undefined") return;
  const masterVolume = Math.max(0, Math.min(1, volumePercent / 100));

  switch (cue) {
    case "boot-phase":
      playTone({ freq: 520, duration: 0.09, type: "sine", volume: 0.12 }, masterVolume);
      break;
    case "boot-complete":
      playTone({ freq: 340, duration: 0.5, type: "sine", volume: 0.16, sweepTo: 880 }, masterVolume);
      break;
    case "click":
      playTone({ freq: 900, duration: 0.045, type: "square", volume: 0.06 }, masterVolume);
      break;
    case "notify":
      playTone({ freq: 700, duration: 0.14, type: "sine", volume: 0.12, sweepTo: 1000 }, masterVolume);
      break;
    case "warning":
      playTone({ freq: 300, duration: 0.22, type: "sawtooth", volume: 0.12, sweepTo: 220 }, masterVolume);
      break;
    case "listen-start":
      playTone({ freq: 480, duration: 0.1, type: "sine", volume: 0.1, sweepTo: 720 }, masterVolume);
      break;
    case "listen-end":
      playTone({ freq: 720, duration: 0.1, type: "sine", volume: 0.1, sweepTo: 420 }, masterVolume);
      break;
    case "error":
      playTone({ freq: 220, duration: 0.3, type: "square", volume: 0.1, sweepTo: 140 }, masterVolume);
      break;
  }
}
