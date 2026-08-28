import type { Mission } from "@/lib/planning/planTypes";

/** Lightweight, display-only projection of a Mission — what a chat
 * MissionCard needs, embedded directly in ChatMessage.mission the same
 * way ChatMessage.toolCall already embeds a tool call's display state
 * (see types/jarvis.ts). Never the source of truth; always derived fresh
 * from the live Mission via toMissionSnapshot(). */
export interface MissionSnapshot {
  missionId: string;
  objective: string;
  status: Mission["status"];
  planSource: Mission["planSource"];
  estimatedSteps: number;
  completedSteps: number;
  failureCount: number;
  synthesis?: string;
  error?: string;
  tasks: { id: string; title: string; agent: string; status: string }[];
}

export function toMissionSnapshot(mission: Mission): MissionSnapshot {
  return {
    missionId: mission.id,
    objective: mission.objective,
    status: mission.status,
    planSource: mission.planSource,
    estimatedSteps: mission.estimatedSteps,
    completedSteps: mission.completedSteps,
    failureCount: mission.failureCount,
    synthesis: mission.synthesis,
    error: mission.error,
    tasks: mission.tasks.map((t) => ({ id: t.id, title: t.title, agent: t.agent, status: t.status })),
  };
}
