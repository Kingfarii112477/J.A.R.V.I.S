import { describe, it, expect } from "vitest";
import { spawnTarget, driftTarget, classificationColor } from "./simulate";

describe("spawnTarget", () => {
  it("produces a target within valid polar and lifecycle bounds", () => {
    for (let i = 0; i < 50; i++) {
      const target = spawnTarget();
      expect(target.angleDeg).toBeGreaterThanOrEqual(0);
      expect(target.angleDeg).toBeLessThan(360);
      expect(target.distance).toBeGreaterThan(0);
      expect(target.distance).toBeLessThanOrEqual(1);
      expect(["THREAT", "FRIENDLY", "NEUTRAL", "UNKNOWN"]).toContain(target.classification);
      expect(target.fadeAt).toBeGreaterThan(target.createdAt);
    }
  });

  it("assigns a unique id to every spawned target", () => {
    const ids = new Set(Array.from({ length: 100 }, () => spawnTarget().id));
    expect(ids.size).toBe(100);
  });
});

describe("driftTarget", () => {
  it("advances angle over time and wraps at 360 degrees", () => {
    const target = spawnTarget();
    const drifted = driftTarget({ ...target, angleDeg: 358 }, 2);
    expect(drifted.angleDeg).toBeLessThan(360);
    expect(drifted.angleDeg).toBeGreaterThanOrEqual(0);
  });

  it("keeps distance clamped within [0.12, 0.96]", () => {
    let target = spawnTarget();
    for (let i = 0; i < 200; i++) {
      target = driftTarget(target, 0.5);
      expect(target.distance).toBeGreaterThanOrEqual(0.12);
      expect(target.distance).toBeLessThanOrEqual(0.96);
    }
  });
});

describe("classificationColor", () => {
  it("uses the tactical orange for threats", () => {
    expect(classificationColor("THREAT")).toBe("#ff5500");
  });
});
