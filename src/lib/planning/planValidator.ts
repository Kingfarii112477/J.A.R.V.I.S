import type { Mission } from "./planTypes";
import { detectCycle, danglingDependencies } from "./taskGraph";
import { agentRegistry } from "@/lib/agents/registry";

export interface PlanValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validates a freshly-generated Mission before it's ever shown to the
 * user for authorization or handed to the orchestrator. Catches
 * everything that would otherwise surface as a confusing runtime failure
 * mid-mission: cycles, dangling dependency references, tasks assigned to
 * an agent the registry doesn't know, tasks requesting a tool their
 * agent isn't allowed to use, and a task count over budget.
 */
export function validatePlan(mission: Mission): PlanValidationResult {
  const errors: string[] = [];

  if (mission.tasks.length === 0) {
    errors.push("Plan has no tasks.");
  }
  if (mission.tasks.length > mission.budget.maxTasks) {
    errors.push(`Plan has ${mission.tasks.length} tasks, exceeding the mission budget of ${mission.budget.maxTasks}.`);
  }

  const cycle = detectCycle(mission.tasks);
  if (cycle.length > 0) {
    errors.push(`Circular dependency detected: ${cycle.join(" → ")}.`);
  }

  for (const dangling of danglingDependencies(mission.tasks)) {
    errors.push(`Task "${dangling.taskId}" depends on unknown task "${dangling.missingDependency}".`);
  }

  const agentIds = new Set<string>();
  for (const task of mission.tasks) {
    const agent = agentRegistry.getAgent(task.agent);
    if (!agent) {
      errors.push(`Task "${task.title}" is assigned to unknown agent "${task.agent}".`);
      continue;
    }
    agentIds.add(task.agent);
    for (const toolName of task.tools) {
      if (!agent.allowedTools.includes(toolName)) {
        errors.push(`Task "${task.title}" requests tool "${toolName}", which ${agent.name} is not permitted to use.`);
      }
    }
  }

  if (agentIds.size > mission.budget.maxAgents) {
    errors.push(`Plan uses ${agentIds.size} distinct agents, exceeding the mission budget of ${mission.budget.maxAgents}.`);
  }

  return { valid: errors.length === 0, errors };
}
