import type { MissionTask } from "@/lib/planning/planTypes";
import { getReadyTasks } from "@/lib/planning/taskGraph";

const DEFAULT_MAX_CONCURRENCY = 3;

/** Selects the next batch of READY-eligible tasks to dispatch together —
 * every independent task in the batch is safe to run concurrently
 * (Promise.all in the orchestrator), capped so a wide fan-out plan
 * doesn't spawn unbounded concurrent ReasoningEngine runs. */
export function nextBatch(tasks: MissionTask[], maxConcurrency = DEFAULT_MAX_CONCURRENCY): MissionTask[] {
  return getReadyTasks(tasks).slice(0, Math.max(1, maxConcurrency));
}
