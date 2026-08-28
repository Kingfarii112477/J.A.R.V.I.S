import type { AgentDefinition, AgentId, AgentRuntimeState, AgentStatus } from "./types";
import { SPECIALIST_AGENTS } from "./specialistAgents";
import { permissionWithinCeiling } from "./baseAgent";
import type { PermissionLevel } from "@/types/tools";

function initialRuntimeState(agentId: AgentId): AgentRuntimeState {
  return { agentId, status: "standby", currentTaskId: null, currentMissionId: null, lastResult: null, lastError: null, updatedAt: Date.now() };
}

/**
 * Central registry for every agent role available to the orchestrator —
 * the single source of truth AgentRouter, PlanValidator, and the
 * Orchestrator all read from. Only ever holds the fixed set of
 * pre-defined specialist agents (see specialistAgents.ts); nothing here
 * lets the model register a new agent or widen an existing one's
 * capabilities at runtime.
 */
class AgentRegistryImpl {
  private definitions = new Map<AgentId, AgentDefinition>();
  private runtime = new Map<AgentId, AgentRuntimeState>();

  constructor(seed: AgentDefinition[]) {
    for (const def of seed) this.registerAgent(def);
  }

  registerAgent(def: AgentDefinition) {
    this.definitions.set(def.id, def);
    if (!this.runtime.has(def.id)) this.runtime.set(def.id, initialRuntimeState(def.id));
  }

  getAgent(id: AgentId): AgentDefinition | undefined {
    return this.definitions.get(id);
  }

  listAgents(): AgentDefinition[] {
    return [...this.definitions.values()];
  }

  findByCapability(capability: string): AgentDefinition[] {
    const needle = capability.toLowerCase();
    return this.listAgents().filter((a) => a.capabilities.some((c) => c.toLowerCase().includes(needle)));
  }

  /** Whether `agentId` is allowed to call `toolName` at `permission` at
   * all — both the tool allowlist AND the permission ceiling must hold.
   * This is a real boundary, not advisory: the orchestrator calls this
   * before ever including a tool in an agent's ReasoningEngine options. */
  canExecute(agentId: AgentId, toolName: string, permission: PermissionLevel): boolean {
    const agent = this.getAgent(agentId);
    if (!agent) return false;
    if (!agent.allowedTools.includes(toolName)) return false;
    return permissionWithinCeiling(permission, agent.maxPermission);
  }

  getStatus(agentId: AgentId): AgentRuntimeState {
    return this.runtime.get(agentId) ?? initialRuntimeState(agentId);
  }

  setStatus(agentId: AgentId, patch: Partial<Omit<AgentRuntimeState, "agentId">>) {
    const current = this.getStatus(agentId);
    const next: AgentRuntimeState = { ...current, ...patch, agentId, updatedAt: Date.now() };
    this.runtime.set(agentId, next);
    return next;
  }

  listStatuses(): AgentRuntimeState[] {
    return this.listAgents().map((a) => this.getStatus(a.id));
  }

  /** Test/dev-only reset — mirrors eventBus.reset()'s role in this codebase. */
  resetRuntime() {
    for (const def of this.definitions.values()) this.runtime.set(def.id, initialRuntimeState(def.id));
  }
}

export const agentRegistry = new AgentRegistryImpl(SPECIALIST_AGENTS);
export type { AgentStatus };
