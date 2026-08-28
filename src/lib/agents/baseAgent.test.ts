import { describe, it, expect } from "vitest";
import { permissionWithinCeiling, PERMISSION_RANK } from "./baseAgent";

describe("permissionWithinCeiling", () => {
  it("orders permission levels SAFE < CONFIRM < RESTRICTED < ADMIN", () => {
    expect(PERMISSION_RANK.SAFE).toBeLessThan(PERMISSION_RANK.CONFIRM);
    expect(PERMISSION_RANK.CONFIRM).toBeLessThan(PERMISSION_RANK.RESTRICTED);
    expect(PERMISSION_RANK.RESTRICTED).toBeLessThan(PERMISSION_RANK.ADMIN);
  });

  it("allows a permission at or below the ceiling", () => {
    expect(permissionWithinCeiling("SAFE", "CONFIRM")).toBe(true);
    expect(permissionWithinCeiling("CONFIRM", "CONFIRM")).toBe(true);
  });

  it("denies a permission above the ceiling", () => {
    expect(permissionWithinCeiling("RESTRICTED", "CONFIRM")).toBe(false);
    expect(permissionWithinCeiling("ADMIN", "SAFE")).toBe(false);
  });
});
