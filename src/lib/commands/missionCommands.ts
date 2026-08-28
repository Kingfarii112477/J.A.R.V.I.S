import { orchestrator } from "@/lib/orchestration/orchestrator";
import { agentRegistry } from "@/lib/agents/registry";
import { validatePlan } from "@/lib/planning/planValidator";
import { getAutonomyLevel, setAutonomyLevel } from "@/lib/autonomy/autonomyManager";
import { AUTONOMY_LEVEL_LABELS, AUTONOMY_LEVEL_DESCRIPTIONS, type AutonomyLevel } from "@/lib/autonomy/autonomyLevels";
import { getSessionId } from "@/lib/utils/id";
import type { Mission } from "@/lib/planning/planTypes";
import type { AgentId } from "@/lib/agents/types";

export interface MissionCommandContext {
  navigate?: (href: string) => void;
}

export interface MissionCommandResult {
  handled: boolean;
  response: string;
}

async function findMission(idOrSuffix: string): Promise<Mission | null> {
  const missions = await orchestrator.listMissions();
  if (idOrSuffix === "latest" || idOrSuffix === "last") return missions[0] ?? null;
  const query = idOrSuffix.trim().toLowerCase();
  return missions.find((m) => m.id.toLowerCase() === query || m.id.toLowerCase().endsWith(query)) ?? null;
}

function missionSummaryLine(m: Mission): string {
  return `  [${m.status}] ${m.id.slice(-8)} — ${m.objective} (${m.completedSteps}/${m.estimatedSteps})`;
}

/**
 * Terminal-only, async command set for missions/agents/plans/autonomy —
 * kept separate from lib/commands/dispatcher.ts (whose contract is
 * synchronous and shared with chat/voice) rather than forcing an async
 * path into it. Reuses the real orchestrator/AgentRegistry/planValidator
 * — never a duplicate implementation of mission logic. Checked by
 * DiagnosticTerminal before falling through to dispatchCommand.
 */
export async function handleMissionCommand(rawInput: string, ctx: MissionCommandContext = {}): Promise<MissionCommandResult | null> {
  const text = rawInput.trim();
  const lower = text.toLowerCase();

  if (lower === "mission demo") {
    const mission = await orchestrator.createDemoMission(getSessionId(), "terminal");
    const lines = mission.tasks.map((t) => `  [${t.status}] ${t.title} (${t.agent})`).join("\n");
    return {
      handled: true,
      response: `Demo mission created: ${mission.id.slice(-8)} — "${mission.objective}"\n${lines}\nType 'mission start ${mission.id.slice(-8)}' to begin.`,
    };
  }

  if (lower === "mission list" || lower === "missions") {
    const missions = await orchestrator.listMissions();
    if (missions.length === 0) return { handled: true, response: "No missions yet — propose one from Chat, or type 'mission demo' to run the built-in demo mission." };
    return { handled: true, response: `Missions:\n${missions.map(missionSummaryLine).join("\n")}` };
  }

  let m = lower.match(/^mission status (.+)$/);
  if (m) {
    const mission = await findMission(m[1]);
    if (!mission) return { handled: true, response: `No mission matching "${m[1]}".` };
    const taskLines = mission.tasks.map((t) => `    [${t.status}] ${t.title} (${t.agent})`).join("\n");
    return {
      handled: true,
      response: `Mission ${mission.id}\nObjective: ${mission.objective}\nStatus: ${mission.status}\nProgress: ${mission.completedSteps}/${mission.estimatedSteps}${mission.error ? `\nNote: ${mission.error}` : ""}\nTasks:\n${taskLines}`,
    };
  }

  m = lower.match(/^mission start (.+)$/);
  if (m) {
    const mission = await findMission(m[1]);
    if (!mission) return { handled: true, response: `No mission matching "${m[1]}".` };
    orchestrator.authorizePlan(mission.id);
    void orchestrator.startMission(mission.id, { sessionId: getSessionId(), source: "terminal", navigate: ctx.navigate });
    return { handled: true, response: `Mission ${mission.id.slice(-8)} started.` };
  }

  m = lower.match(/^mission pause (.+)$/);
  if (m) {
    const mission = await findMission(m[1]);
    if (!mission) return { handled: true, response: `No mission matching "${m[1]}".` };
    orchestrator.pauseMission(mission.id);
    return { handled: true, response: `Mission ${mission.id.slice(-8)} will pause after its current batch finishes.` };
  }

  m = lower.match(/^mission resume (.+)$/);
  if (m) {
    const mission = await findMission(m[1]);
    if (!mission) return { handled: true, response: `No mission matching "${m[1]}".` };
    void orchestrator.resumeMission(mission.id, { sessionId: getSessionId(), source: "terminal", navigate: ctx.navigate });
    return { handled: true, response: `Mission ${mission.id.slice(-8)} resumed.` };
  }

  m = lower.match(/^mission cancel (.+)$/);
  if (m) {
    const mission = await findMission(m[1]);
    if (!mission) return { handled: true, response: `No mission matching "${m[1]}".` };
    await orchestrator.cancelMission(mission.id);
    return { handled: true, response: `Mission ${mission.id.slice(-8)} cancelled.` };
  }

  if (lower === "agent list" || lower === "agents") {
    const lines = agentRegistry.listAgents().map((a) => `  [${agentRegistry.getStatus(a.id).status.toUpperCase()}] ${a.id} — ${a.name}`);
    return { handled: true, response: `Agents:\n${lines.join("\n")}` };
  }

  m = lower.match(/^agent (?:status|inspect) (.+)$/);
  if (m) {
    const agent = agentRegistry.getAgent(m[1].trim() as AgentId);
    if (!agent) return { handled: true, response: `No agent "${m[1]}". Type 'agent list' for available agents.` };
    const status = agentRegistry.getStatus(agent.id);
    return {
      handled: true,
      response: `${agent.name} (${agent.id})\nRole: ${agent.role}\nStatus: ${status.status.toUpperCase()}\nAllowed tools: ${agent.allowedTools.join(", ")}\nMax permission: ${agent.maxPermission}${status.lastError ? `\nLast error: ${status.lastError}` : ""}`,
    };
  }

  m = lower.match(/^plan show (.+)$/);
  if (m) {
    const mission = await findMission(m[1]);
    if (!mission) return { handled: true, response: `No mission matching "${m[1]}".` };
    const lines = mission.tasks.map((t) => `  ${t.id.slice(-6)} [${t.status}] ${t.title} (${t.agent})${t.dependencies.length ? ` depends on: ${t.dependencies.map((d) => d.slice(-6)).join(", ")}` : ""}`);
    return { handled: true, response: `Plan for ${mission.id.slice(-8)} (source: ${mission.planSource}):\n${lines.join("\n")}` };
  }

  m = lower.match(/^plan validate (.+)$/);
  if (m) {
    const mission = await findMission(m[1]);
    if (!mission) return { handled: true, response: `No mission matching "${m[1]}".` };
    const result = validatePlan(mission);
    return { handled: true, response: result.valid ? "Plan is valid." : `Plan is invalid:\n${result.errors.map((e) => `  - ${e}`).join("\n")}` };
  }

  if (lower.startsWith("task cancel ") || lower.startsWith("task status ")) {
    return { handled: true, response: "Individual task control isn't exposed — use 'mission status <id>' to see tasks, or 'mission cancel <id>' to cancel the whole mission." };
  }

  if (lower === "task list") {
    const missions = await orchestrator.listMissions();
    const active = missions.find((mm) => mm.status === "RUNNING") ?? missions[0];
    if (!active) return { handled: true, response: "No missions yet." };
    const taskLines = active.tasks.map((t) => `  [${t.status}] ${t.title} (${t.agent})`).join("\n");
    return { handled: true, response: `Tasks for ${active.id.slice(-8)}:\n${taskLines}` };
  }

  if (lower === "autonomy status") {
    const level = getAutonomyLevel();
    return { handled: true, response: `Autonomy level: ${level} — ${AUTONOMY_LEVEL_LABELS[level]}\n${AUTONOMY_LEVEL_DESCRIPTIONS[level]}` };
  }

  m = lower.match(/^autonomy set (\d)$/);
  if (m) {
    const level = Number(m[1]);
    if (level < 0 || level > 4) return { handled: true, response: "Autonomy level must be between 0 and 4." };
    setAutonomyLevel(level as AutonomyLevel);
    return { handled: true, response: `Autonomy level set to ${level} — ${AUTONOMY_LEVEL_LABELS[level as AutonomyLevel]}.` };
  }

  return null;
}

export const MISSION_COMMANDS = [
  "mission demo",
  "mission list",
  "mission status <id>",
  "mission start <id>",
  "mission pause <id>",
  "mission resume <id>",
  "mission cancel <id>",
  "agent list",
  "agent status <id>",
  "plan show <id>",
  "plan validate <id>",
  "task list",
  "autonomy status",
  "autonomy set <0-4>",
];
