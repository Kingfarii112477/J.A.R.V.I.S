import type { ToolExecutionContext } from "@/types/tools";
import type { AutonomyLevel } from "@/lib/autonomy/autonomyLevels";

/** Everything one MissionTask execution needs beyond the task/mission
 * data itself — bundled so coordinator.executeMissionTask() takes one
 * cohesive object instead of a long positional-argument list. */
export interface MissionExecutionContext {
  toolCtx: ToolExecutionContext;
  autonomyLevel: AutonomyLevel;
  /** Whether the whole mission plan was authorized up front (autonomy
   * level 3's "delegated" behavior) — passed straight through to
   * autonomyPolicy.decideToolApproval for every tool call this task makes. */
  missionAuthorized: boolean;
  signal?: AbortSignal;
}
