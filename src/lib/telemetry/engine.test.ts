import { describe, it, expect } from "vitest";
import { TelemetryEngine, lerp } from "./engine";
import { initialTelemetry } from "@/store/jarvisStore";

describe("lerp", () => {
  it("interpolates linearly and clamps t to [0,1]", () => {
    expect(lerp(0, 10, 0.5)).toBe(5);
    expect(lerp(0, 10, -1)).toBe(0);
    expect(lerp(0, 10, 2)).toBe(10);
  });
});

describe("TelemetryEngine", () => {
  it("produces a snapshot with the same keys it was seeded with", () => {
    const engine = new TelemetryEngine(initialTelemetry);
    const snap = engine.tick(16, "IDLE");
    expect(Object.keys(snap).sort()).toEqual(Object.keys(initialTelemetry).sort());
  });

  it("never produces NaN or negative values across many ticks", () => {
    const engine = new TelemetryEngine(initialTelemetry);
    let snap = engine.snapshot();
    for (let i = 0; i < 500; i++) {
      snap = engine.tick(16, "THINKING");
      for (const value of Object.values(snap)) {
        expect(Number.isNaN(value)).toBe(false);
        expect(value).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("moves values smoothly rather than jumping instantly to a new target", () => {
    const engine = new TelemetryEngine({ ...initialTelemetry, cpu: 10 });
    const first = engine.tick(16, "DIAGNOSTICS").cpu;
    // A single ~16ms frame should nudge the value only slightly, not teleport it.
    expect(Math.abs(first - 10)).toBeLessThan(5);
  });

  it("biases CPU and neural activity upward under the DIAGNOSTICS state over time", () => {
    const engine = new TelemetryEngine({ ...initialTelemetry, cpu: 20, neuralActivity: 20 });
    let snap = engine.snapshot();
    for (let i = 0; i < 400; i++) {
      snap = engine.tick(50, "DIAGNOSTICS");
    }
    expect(snap.cpu).toBeGreaterThan(40);
  });

  it("decays activity toward near-zero under the OFFLINE state over time", () => {
    const engine = new TelemetryEngine({ ...initialTelemetry, cpu: 80, neuralActivity: 80 });
    let snap = engine.snapshot();
    for (let i = 0; i < 400; i++) {
      snap = engine.tick(50, "OFFLINE");
    }
    expect(snap.cpu).toBeLessThan(20);
    expect(snap.neuralActivity).toBeLessThan(20);
  });
});
