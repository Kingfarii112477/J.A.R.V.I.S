import type { ToolDefinition, PermissionLevel } from "@/types/tools";
import type { AgentId } from "@/lib/agents/types";
import { agentRegistry } from "@/lib/agents/registry";

/** Sensible risk default when a tool doesn't set one explicitly —
 * derived from its permission level, which every tool already has. */
function defaultRiskForPermission(permission: PermissionLevel): "LOW" | "MEDIUM" | "HIGH" {
  if (permission === "SAFE") return "LOW";
  if (permission === "CONFIRM") return "MEDIUM";
  return "HIGH";
}

export function toolRisk(tool: ToolDefinition): "LOW" | "MEDIUM" | "HIGH" {
  return tool.risk ?? defaultRiskForPermission(tool.permission);
}

export function toolSideEffects(tool: ToolDefinition): "NONE" | "EXTERNAL" | "DESTRUCTIVE" {
  return tool.sideEffects ?? "NONE";
}

export function toolReversible(tool: ToolDefinition): boolean {
  if (tool.reversible !== undefined) return tool.reversible;
  return tool.permission === "SAFE";
}

/** Which registered agents currently have access to a tool by name —
 * computed live from AgentRegistry (the single source of truth for
 * agent tool access), never a separately-maintained list that could
 * drift out of sync. */
export function agentsWithAccess(toolName: string): AgentId[] {
  return agentRegistry
    .listAgents()
    .filter((a) => a.allowedTools.includes(toolName))
    .map((a) => a.id);
}
