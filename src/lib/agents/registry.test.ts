import { describe, it, expect, beforeEach } from "vitest";
import { agentRegistry } from "./registry";

beforeEach(() => {
  agentRegistry.resetRuntime();
});

describe("AgentRegistry", () => {
  it("has all 8 specialist agents registered", () => {
    const agents = agentRegistry.listAgents();
    expect(agents).toHaveLength(8);
    expect(agents.map((a) => a.id).sort()).toEqual(
      ["analysis", "automation", "coding", "memory", "orchestrator", "planning", "research", "security"].sort()
    );
  });

  it("retrieves a registered agent by id", () => {
    const agent = agentRegistry.getAgent("research");
    expect(agent?.name).toBe("Research Agent");
    expect(agent?.allowedTools).toContain("web_search");
  });

  it("returns undefined for an unknown agent id", () => {
    expect(agentRegistry.getAgent("nonexistent" as never)).toBeUndefined();
  });

  it("finds agents by capability substring", () => {
    const matches = agentRegistry.findByCapability("web research");
    expect(matches.map((a) => a.id)).toContain("research");
  });

  it("canExecute allows a tool within the agent's allowlist and permission ceiling", () => {
    expect(agentRegistry.canExecute("research", "web_search", "SAFE")).toBe(true);
  });

  it("canExecute denies a tool not in the agent's allowlist", () => {
    expect(agentRegistry.canExecute("research", "n8n_workflow", "CONFIRM")).toBe(false);
  });

  it("canExecute denies a permission above the agent's ceiling even if the tool were allowed", () => {
    // orchestrator's ceiling is SAFE — a hypothetical RESTRICTED call must be denied
    expect(agentRegistry.canExecute("orchestrator", "system_status", "RESTRICTED")).toBe(false);
  });

  it("canExecute denies an unknown agent outright", () => {
    expect(agentRegistry.canExecute("nonexistent" as never, "system_status", "SAFE")).toBe(false);
  });

  it("tracks and returns per-agent runtime status", () => {
    expect(agentRegistry.getStatus("research").status).toBe("standby");
    agentRegistry.setStatus("research", { status: "active", currentTaskId: "t1" });
    expect(agentRegistry.getStatus("research").status).toBe("active");
    expect(agentRegistry.getStatus("research").currentTaskId).toBe("t1");
  });

  it("listStatuses returns one entry per registered agent", () => {
    expect(agentRegistry.listStatuses()).toHaveLength(8);
  });

  it("resetRuntime restores every agent to standby", () => {
    agentRegistry.setStatus("memory", { status: "error", lastError: "boom" });
    agentRegistry.resetRuntime();
    expect(agentRegistry.getStatus("memory").status).toBe("standby");
    expect(agentRegistry.getStatus("memory").lastError).toBeNull();
  });
});
