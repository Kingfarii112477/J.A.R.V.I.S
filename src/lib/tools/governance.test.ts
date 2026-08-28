import { describe, it, expect } from "vitest";
import { toolRisk, toolSideEffects, toolReversible, agentsWithAccess } from "./governance";
import { toolRegistry } from "./registry";
import { registerBuiltinTools } from "./builtins";

registerBuiltinTools();

describe("tool governance metadata", () => {
  it("reports explicit risk/sideEffects/reversible for memory_delete", () => {
    const tool = toolRegistry.get("memory_delete")!;
    expect(toolRisk(tool)).toBe("MEDIUM");
    expect(toolSideEffects(tool)).toBe("DESTRUCTIVE");
    expect(toolReversible(tool)).toBe(false);
  });

  it("reports explicit HIGH risk for n8n_workflow", () => {
    const tool = toolRegistry.get("n8n_workflow")!;
    expect(toolRisk(tool)).toBe("HIGH");
    expect(toolSideEffects(tool)).toBe("EXTERNAL");
  });

  it("defaults risk from permission when not set explicitly", () => {
    const tool = toolRegistry.get("system_status")!;
    expect(tool.risk).toBeUndefined();
    expect(toolRisk(tool)).toBe("LOW");
    expect(toolReversible(tool)).toBe(true);
  });

  it("defaults sideEffects to NONE when not set", () => {
    const tool = toolRegistry.get("system_status")!;
    expect(toolSideEffects(tool)).toBe("NONE");
  });

  it("agentsWithAccess reflects the live AgentRegistry, not a separate list", () => {
    const agents = agentsWithAccess("web_search");
    expect(agents).toContain("research");
    expect(agents).not.toContain("security");
  });
});
