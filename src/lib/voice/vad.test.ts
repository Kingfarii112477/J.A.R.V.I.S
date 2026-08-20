import { describe, it, expect } from "vitest";
import { averageLevel, isSilentTick, shouldAutoStopForSilence, VAD_SILENCE_TICKS_TO_STOP } from "./vad";

describe("averageLevel", () => {
  it("averages a level array", () => {
    expect(averageLevel([0, 0.2, 0.4, 0.6])).toBeCloseTo(0.3);
  });

  it("returns 0 for an empty array", () => {
    expect(averageLevel([])).toBe(0);
  });
});

describe("isSilentTick", () => {
  it("treats a quiet frame as silent", () => {
    expect(isSilentTick([0.01, 0.02, 0.0, 0.03])).toBe(true);
  });

  it("treats a loud frame as not silent", () => {
    expect(isSilentTick([0.5, 0.6, 0.4, 0.55])).toBe(false);
  });
});

describe("shouldAutoStopForSilence", () => {
  it("never fires before the user has spoken", () => {
    expect(shouldAutoStopForSilence(VAD_SILENCE_TICKS_TO_STOP + 10, false)).toBe(false);
  });

  it("does not fire until the silence threshold is reached", () => {
    expect(shouldAutoStopForSilence(VAD_SILENCE_TICKS_TO_STOP - 1, true)).toBe(false);
  });

  it("fires once the user has spoken and gone silent long enough", () => {
    expect(shouldAutoStopForSilence(VAD_SILENCE_TICKS_TO_STOP, true)).toBe(true);
  });
});
