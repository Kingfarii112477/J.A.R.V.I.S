import type { Mission } from "@/lib/planning/planTypes";
import { DEFAULT_MISSION_BUDGET } from "@/lib/planning/planTypes";
import { createMissionTask } from "@/lib/tasks/taskManager";
import { generateId } from "@/lib/utils/id";
import { DEFAULT_AUTONOMY_LEVEL } from "@/lib/autonomy/autonomyLevels";

export const DEMO_MISSION_OBJECTIVE = "J.A.R.V.I.S System Analysis";

/**
 * The spec's built-in demo mission — a fixed, hand-authored plan (rather
 * than the heuristic decomposer) so it exactly matches the five named
 * steps, but otherwise an entirely ordinary Mission that runs through
 * the same orchestrator/executionLoop/coordinator as any other. Every
 * tool it uses (system_status, run_diagnostics, memory_search) is SAFE
 * and local — no external side effects, nothing destructive — so a user
 * can experience full autonomous orchestration (including a genuine
 * parallel step) without configuring anything or risking anything real.
 */
export function createDemoMission(sessionId: string): Mission {
  const missionId = generateId("mission");
  const now = Date.now();

  const telemetry = createMissionTask({
    missionId,
    title: "Inspect system telemetry",
    description: "Check the live status of every J.A.R.V.I.S subsystem.",
    agent: "analysis",
    tools: ["system_status"],
    dependencies: [],
    input: "Check system_status and report which subsystems are online, and their overall health.",
  });
  const health = createMissionTask({
    missionId,
    title: "Analyze subsystem health",
    description: "Run a full diagnostics sweep and interpret the resulting health score.",
    agent: "analysis",
    tools: ["run_diagnostics"],
    dependencies: [telemetry.id],
    input: "Run run_diagnostics and explain what the resulting health score indicates about overall system condition.",
  });
  const diagnosticsReview = createMissionTask({
    missionId,
    title: "Review recent diagnostic events",
    description: "Summarize what the most recent diagnostics run revealed.",
    agent: "analysis",
    tools: ["run_diagnostics"],
    dependencies: [health.id],
    input: "Based on the diagnostics you already have, summarize any anomalies or points worth flagging. If everything is nominal, say so plainly.",
  });
  const memorySearch = createMissionTask({
    missionId,
    title: "Search memory for relevant patterns",
    description: "Look for prior stored context relevant to system health or optimization.",
    agent: "memory",
    tools: ["memory_search"],
    dependencies: [], // independent of the analysis chain — runs in parallel with it
    input: "Search memory for anything relevant to system performance, optimization, or prior diagnostics discussions.",
  });
  const summary = createMissionTask({
    missionId,
    title: "Produce optimization summary",
    description: "Synthesize the above findings into one final recommendation.",
    agent: "orchestrator",
    tools: [],
    dependencies: [telemetry.id, health.id, diagnosticsReview.id, memorySearch.id],
    input: "Synthesize the telemetry, diagnostics, and memory findings from this mission into a short, honest optimization summary for the user.",
  });

  const tasks = [telemetry, health, diagnosticsReview, memorySearch, summary];

  return {
    id: missionId,
    sessionId,
    objective: DEMO_MISSION_OBJECTIVE,
    status: "DRAFT",
    tasks,
    autonomyLevel: DEFAULT_AUTONOMY_LEVEL,
    budget: DEFAULT_MISSION_BUDGET,
    planSource: "heuristic",
    createdAt: now,
    updatedAt: now,
    startedAt: null,
    completedAt: null,
    estimatedSteps: tasks.length,
    completedSteps: 0,
    failureCount: 0,
    modelCallCount: 0,
    toolCallCount: 0,
    retryCount: 0,
  };
}
