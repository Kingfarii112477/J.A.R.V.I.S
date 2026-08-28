import type { AutonomyLevel } from "./autonomyLevels";
import type { PermissionLevel } from "@/types/tools";

export interface AutonomyDecision {
  autoApprove: boolean;
  reason: string;
}

/**
 * The single place that decides whether one tool call may proceed
 * without stopping for human approval, given the mission's autonomy
 * level. Called by the orchestrator's coordinator for every CONFIRM
 * (or, at level 1, every) tool call a task's ReasoningEngine run wants
 * to make — never bypassed, never overridable by an agent or the model.
 *
 * RESTRICTED/ADMIN tools are already structurally unreachable from any
 * reasoning run (lib/tools/schema.ts's toolsToJsonSchema only ever
 * offers SAFE/CONFIRM tools to the model) — the explicit refusal here is
 * defense in depth, not the only thing stopping them.
 */
export function decideToolApproval(level: AutonomyLevel, permission: PermissionLevel, missionAuthorized: boolean): AutonomyDecision {
  if (permission === "RESTRICTED" || permission === "ADMIN") {
    return { autoApprove: false, reason: "RESTRICTED/ADMIN tools always require explicit authorization, regardless of autonomy level." };
  }
  switch (level) {
    case 0:
      return { autoApprove: false, reason: "Autonomy is set to Manual — no autonomous actions are permitted." };
    case 1:
      return { autoApprove: false, reason: "Autonomy is Assisted — every action requires individual approval." };
    case 2:
      return permission === "SAFE"
        ? { autoApprove: true, reason: "SAFE action, auto-approved under Supervised autonomy." }
        : { autoApprove: false, reason: "CONFIRM action requires approval under Supervised autonomy." };
    case 3:
      return missionAuthorized
        ? { autoApprove: true, reason: "The mission plan was authorized up front; this declared step proceeds." }
        : { autoApprove: false, reason: "Autonomy is Delegated — the mission plan has not yet been authorized." };
    case 4:
      return { autoApprove: true, reason: "SAFE/CONFIRM actions auto-execute under Controlled Autonomous autonomy." };
  }
}

/** Whether a mission may even be started at this autonomy level — Level
 * 0 (Manual) means J.A.R.V.I.S only responds, no autonomous missions at all. */
export function missionsAllowedAtLevel(level: AutonomyLevel): boolean {
  return level > 0;
}
