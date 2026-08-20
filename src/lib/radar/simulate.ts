import type { RadarTarget } from "@/types/jarvis";

const CLASS_COLOR: Record<RadarTarget["classification"], string> = {
  THREAT: "#ff5500",
  FRIENDLY: "#22d3ee",
  NEUTRAL: "#67e8f9",
  UNKNOWN: "#8b5cf6",
};

export function classificationColor(c: RadarTarget["classification"]) {
  return CLASS_COLOR[c];
}

function weightedClassification(): RadarTarget["classification"] {
  const r = Math.random();
  if (r < 0.07) return "THREAT";
  if (r < 0.4) return "FRIENDLY";
  if (r < 0.75) return "NEUTRAL";
  return "UNKNOWN";
}

export function spawnTarget(): RadarTarget {
  const now = Date.now();
  return {
    id: `tgt-${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    angleDeg: Math.random() * 360,
    distance: 0.22 + Math.random() * 0.72,
    classification: weightedClassification(),
    signal: 0.45 + Math.random() * 0.55,
    createdAt: now,
    fadeAt: now + 10_000 + Math.random() * 9000,
  };
}

export function driftTarget(t: RadarTarget, dtSeconds: number): RadarTarget {
  return {
    ...t,
    angleDeg: (t.angleDeg + dtSeconds * (3 + Math.random() * 3)) % 360,
    distance: Math.min(0.96, Math.max(0.12, t.distance + (Math.random() - 0.5) * 0.012)),
  };
}

export function polarToXY(angleDeg: number, distance: number, radius: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: Math.cos(rad) * distance * radius,
    y: Math.sin(rad) * distance * radius,
  };
}
