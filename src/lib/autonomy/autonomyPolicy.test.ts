import { describe, it, expect } from "vitest";
import { decideToolApproval, missionsAllowedAtLevel } from "./autonomyPolicy";

describe("decideToolApproval", () => {
  it("never auto-approves RESTRICTED regardless of level", () => {
    for (let level = 0; level <= 4; level++) {
      expect(decideToolApproval(level as never, "RESTRICTED", true).autoApprove).toBe(false);
    }
  });

  it("never auto-approves ADMIN regardless of level", () => {
    for (let level = 0; level <= 4; level++) {
      expect(decideToolApproval(level as never, "ADMIN", true).autoApprove).toBe(false);
    }
  });

  it("Level 0 (Manual) never auto-approves anything", () => {
    expect(decideToolApproval(0, "SAFE", true).autoApprove).toBe(false);
    expect(decideToolApproval(0, "CONFIRM", true).autoApprove).toBe(false);
  });

  it("Level 1 (Assisted) requires approval even for SAFE actions", () => {
    expect(decideToolApproval(1, "SAFE", true).autoApprove).toBe(false);
  });

  it("Level 2 (Supervised, default) auto-approves SAFE but not CONFIRM", () => {
    expect(decideToolApproval(2, "SAFE", false).autoApprove).toBe(true);
    expect(decideToolApproval(2, "CONFIRM", false).autoApprove).toBe(false);
  });

  it("Level 3 (Delegated) approves CONFIRM only once the plan is authorized", () => {
    expect(decideToolApproval(3, "CONFIRM", false).autoApprove).toBe(false);
    expect(decideToolApproval(3, "CONFIRM", true).autoApprove).toBe(true);
  });

  it("Level 4 (Controlled Autonomous) auto-approves both SAFE and CONFIRM", () => {
    expect(decideToolApproval(4, "SAFE", false).autoApprove).toBe(true);
    expect(decideToolApproval(4, "CONFIRM", false).autoApprove).toBe(true);
  });
});

describe("missionsAllowedAtLevel", () => {
  it("disallows missions at Manual (0)", () => {
    expect(missionsAllowedAtLevel(0)).toBe(false);
  });

  it("allows missions at every level above Manual", () => {
    expect(missionsAllowedAtLevel(1)).toBe(true);
    expect(missionsAllowedAtLevel(2)).toBe(true);
    expect(missionsAllowedAtLevel(3)).toBe(true);
    expect(missionsAllowedAtLevel(4)).toBe(true);
  });
});
