import { describe, it, expect } from "vitest";
import { looksLikeMissionObjective } from "./objectiveDetection";

describe("looksLikeMissionObjective", () => {
  it("recognizes the spec's worked example", () => {
    expect(looksLikeMissionObjective("Research the best AI automation tools, compare them, create a report and save the findings.")).toBe(true);
  });

  it("recognizes an explicit mission phrase alone", () => {
    expect(looksLikeMissionObjective("start a mission to look into servers")).toBe(true);
  });

  it("does not treat an ordinary single-tool request as a mission", () => {
    expect(looksLikeMissionObjective("what's the weather in Paris")).toBe(false);
  });

  it("does not treat a simple memory request as a mission", () => {
    expect(looksLikeMissionObjective("remember that my favorite color is teal")).toBe(false);
  });

  it("does not treat a single research verb alone as a mission", () => {
    expect(looksLikeMissionObjective("search for cat pictures")).toBe(false);
  });

  it("treats research plus an explicit report request as a mission", () => {
    expect(looksLikeMissionObjective("research competitor pricing and prepare a report")).toBe(true);
  });
});
