import type { AgentId } from "@/lib/agents/types";
import type { Mission, MissionTask } from "./planTypes";
import { DEFAULT_MISSION_BUDGET } from "./planTypes";
import { agentRegistry } from "@/lib/agents/registry";
import { createMissionTask } from "@/lib/tasks/taskManager";
import { generateId } from "@/lib/utils/id";
import { DEFAULT_AUTONOMY_LEVEL } from "@/lib/autonomy/autonomyLevels";

interface StageSignal {
  agent: AgentId;
  test: RegExp;
  title: string;
  description: string;
}

// Independent signals (unlike agentRouter's first-match routing) — a
// single objective commonly implies several stages at once, e.g.
// "research X, compare them, and write a report" is both a research
// stage and (via the always-appended synthesis stage) a report stage.
const STAGE_SIGNALS: StageSignal[] = [
  {
    agent: "research",
    test: /\b(research|search|find|source|investigate|look up|compare)\b/i,
    title: "Research",
    description: "Gather real information relevant to the objective via web search and preserve source metadata.",
  },
  {
    agent: "analysis",
    test: /\b(analy[sz]e|inspect|review|diagnos|evaluate|assess|improve)\b/i,
    title: "Analyze",
    description: "Analyze the gathered information or current system state and identify concrete findings.",
  },
  {
    agent: "automation",
    test: /\b(automat|workflow|trigger|schedule)\b/i,
    title: "Automate",
    description: "Plan and, once authorized, trigger the relevant configured automation workflow.",
  },
  {
    agent: "memory",
    test: /\b(remember|memory|recall|save|store)\b/i,
    title: "Record findings",
    description: "Store durable, non-sensitive findings from this mission for future retrieval.",
  },
];

/**
 * Deterministic heuristic decomposer — the mission planner's sole
 * strategy in this implementation (see the Phase 4 report's "Known
 * limitations": an LLM-generated plan was scoped out in favor of a
 * decomposer that is trivially testable, needs no provider/API key —
 * keeping demo mode fully functional for planning — and never risks
 * corrupting the task graph with malformed model output. The genuine
 * open-ended reasoning still happens per-task: every MissionTask this
 * produces is executed by the full multi-step ReasoningEngine, which
 * really does decide which tools to call and how to use their results).
 *
 * Multiple independent stage tasks (e.g. research + analysis) have no
 * dependency between each other and can run in parallel; a final
 * synthesis task always depends on every other task, guaranteeing the
 * mission ends with "Produce a final synthesis."
 */
export function createHeuristicPlan(objective: string, sessionId: string): Mission {
  const stageTasks: MissionTask[] = [];
  for (const signal of STAGE_SIGNALS) {
    if (!signal.test.test(objective)) continue;
    const agent = agentRegistry.getAgent(signal.agent);
    if (!agent) continue;
    stageTasks.push(
      createMissionTask({
        missionId: "", // patched below once the mission id exists
        title: signal.title,
        description: signal.description,
        agent: signal.agent,
        tools: agent.allowedTools,
        dependencies: [],
        input: `${signal.description}\n\nOverall mission objective: "${objective}"`,
      })
    );
  }

  if (stageTasks.length === 0) {
    // No recognizable stage signal — a single generic task handles the
    // whole objective directly, same fallback spirit as ReasoningEngine's
    // own "usedReasoning: false" path: never leave the user with nothing.
    const orchestrator = agentRegistry.getAgent("orchestrator")!;
    stageTasks.push(
      createMissionTask({
        missionId: "",
        title: "Address the objective",
        description: objective,
        agent: "orchestrator",
        tools: orchestrator.allowedTools,
        dependencies: [],
        input: objective,
      })
    );
  }

  const synthesisTask =
    stageTasks.length > 1
      ? createMissionTask({
          missionId: "",
          title: "Synthesize findings",
          description: "Combine every prior task's results into one final, honest summary for the user.",
          agent: "orchestrator",
          tools: agentRegistry.getAgent("orchestrator")!.allowedTools,
          dependencies: stageTasks.map((t) => t.id),
          input: `Summarize the mission's findings honestly. Overall objective: "${objective}"`,
        })
      : null;

  const tasks = synthesisTask ? [...stageTasks, synthesisTask] : stageTasks;
  const missionId = generateId("mission");
  const patchedTasks = tasks.map((t) => ({ ...t, missionId }));
  const now = Date.now();

  return {
    id: missionId,
    sessionId,
    objective,
    status: "DRAFT",
    tasks: patchedTasks,
    autonomyLevel: DEFAULT_AUTONOMY_LEVEL,
    budget: DEFAULT_MISSION_BUDGET,
    planSource: "heuristic",
    createdAt: now,
    updatedAt: now,
    startedAt: null,
    completedAt: null,
    estimatedSteps: patchedTasks.length,
    completedSteps: 0,
    failureCount: 0,
    modelCallCount: 0,
    toolCallCount: 0,
    retryCount: 0,
  };
}
