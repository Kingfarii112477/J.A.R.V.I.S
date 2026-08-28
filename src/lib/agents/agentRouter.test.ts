import { describe, it, expect } from "vitest";
import { routeTaskToAgent } from "./agentRouter";

describe("routeTaskToAgent", () => {
  it("routes research-shaped descriptions to the research agent", () => {
    expect(routeTaskToAgent("Search for and compare the top options")).toBe("research");
  });

  it("prioritizes automation over research when both signals appear (first-match-wins order)", () => {
    // "automation" itself matches the automation rule before the research
    // rule is ever reached — this is deliberate precedence, not a bug.
    expect(routeTaskToAgent("Research the best AI automation tools")).toBe("automation");
  });

  it("routes analysis-shaped descriptions to the analysis agent", () => {
    expect(routeTaskToAgent("Analyze the current subsystem health")).toBe("analysis");
  });

  it("routes automation-shaped descriptions to the automation agent", () => {
    expect(routeTaskToAgent("Trigger the workflow for lead processing")).toBe("automation");
  });

  it("routes memory-shaped descriptions to the memory agent", () => {
    expect(routeTaskToAgent("Remember what we discussed about pricing")).toBe("memory");
  });

  it("routes security-shaped descriptions to the security agent", () => {
    expect(routeTaskToAgent("Review the permission risk for this action")).toBe("security");
  });

  it("falls back to the orchestrator for unrecognized descriptions", () => {
    expect(routeTaskToAgent("Say hello")).toBe("orchestrator");
  });
});
