import type { JarvisState, TelemetrySnapshot } from "@/types/jarvis";

type MetricKey = keyof TelemetrySnapshot;

interface MetricRange {
  min: number;
  max: number;
}

const baseRanges: Record<MetricKey, MetricRange> = {
  cpu: { min: 28, max: 55 },
  memory: { min: 40, max: 68 },
  neuralActivity: { min: 55, max: 82 },
  aiStability: { min: 94, max: 99 },
  signalStrength: { min: 80, max: 96 },
  networkStability: { min: 84, max: 97 },
  voiceLatencyMs: { min: 60, max: 140 },
  aiResponseMs: { min: 90, max: 220 },
  dataFlow: { min: 55, max: 85 },
  power: { min: 92, max: 100 },
  threatLevel: { min: 0, max: 8 },
};

/** Per-state bias applied on top of the base range, e.g. THINKING pushes
 * CPU/neural activity higher; WARNING raises threat level. Values are
 * additive offsets to min/max. */
const stateBias: Partial<Record<JarvisState, Partial<Record<MetricKey, MetricRange>>>> = {
  THINKING: {
    cpu: { min: 55, max: 78 },
    neuralActivity: { min: 80, max: 98 },
    aiResponseMs: { min: 140, max: 320 },
  },
  PROCESSING: {
    cpu: { min: 60, max: 88 },
    dataFlow: { min: 75, max: 96 },
  },
  DIAGNOSTICS: {
    cpu: { min: 65, max: 92 },
    memory: { min: 55, max: 80 },
    dataFlow: { min: 80, max: 98 },
  },
  SPEAKING: {
    voiceLatencyMs: { min: 40, max: 90 },
    neuralActivity: { min: 65, max: 88 },
  },
  LISTENING: {
    voiceLatencyMs: { min: 30, max: 70 },
  },
  WARNING: {
    threatLevel: { min: 35, max: 70 },
    aiStability: { min: 78, max: 90 },
  },
  ERROR: {
    aiStability: { min: 40, max: 65 },
    networkStability: { min: 20, max: 50 },
  },
  OFFLINE: {
    cpu: { min: 0, max: 4 },
    neuralActivity: { min: 0, max: 2 },
    aiStability: { min: 0, max: 10 },
    signalStrength: { min: 0, max: 5 },
    networkStability: { min: 0, max: 5 },
    dataFlow: { min: 0, max: 3 },
    power: { min: 10, max: 25 },
  },
};

function randomInRange(range: MetricRange) {
  return range.min + Math.random() * (range.max - range.min);
}

function rangeFor(metric: MetricKey, state: JarvisState): MetricRange {
  return stateBias[state]?.[metric] ?? baseRanges[metric];
}

const LERP_RATE = 0.035;
const RETARGET_INTERVAL_MS = 2600;

export class TelemetryEngine {
  private current: TelemetrySnapshot;
  private targets: TelemetrySnapshot;
  private msSinceRetarget = 0;

  constructor(initial: TelemetrySnapshot) {
    this.current = { ...initial };
    this.targets = { ...initial };
  }

  private rerollTargets(state: JarvisState) {
    const keys = Object.keys(this.targets) as MetricKey[];
    for (const key of keys) {
      this.targets[key] = randomInRange(rangeFor(key, state));
    }
  }

  tick(deltaMs: number, state: JarvisState): TelemetrySnapshot {
    this.msSinceRetarget += deltaMs;
    if (this.msSinceRetarget >= RETARGET_INTERVAL_MS) {
      this.msSinceRetarget = 0;
      this.rerollTargets(state);
    }

    const rate = 1 - Math.pow(1 - LERP_RATE, deltaMs / 16.67);
    const keys = Object.keys(this.current) as MetricKey[];
    for (const key of keys) {
      this.current[key] = lerp(this.current[key], this.targets[key], rate);
    }

    return { ...this.current };
  }

  snapshot(): TelemetrySnapshot {
    return { ...this.current };
  }

  /** Force an immediate spike toward a target range, e.g. when diagnostics start. */
  spike(metric: MetricKey, range: MetricRange) {
    this.targets[metric] = randomInRange(range);
  }
}

export function lerp(a: number, b: number, t: number) {
  return a + (b - a) * clamp01(t);
}

function clamp01(t: number) {
  return Math.min(1, Math.max(0, t));
}
