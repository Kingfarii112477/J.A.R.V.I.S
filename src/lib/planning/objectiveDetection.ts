import { STAGE_SIGNALS } from "./planner";

const EXPLICIT_MISSION_PHRASES = /\b(start a mission|create a mission|run a mission|full analysis|comprehensive report)\b/i;
const REPORT_PHRASES = /\b(create a report|prepare a report|write a report|save the findings)\b/i;

/**
 * Deterministic classifier deciding whether a chat/voice message reads
 * as a multi-step objective (propose a mission) versus an ordinary
 * request (run the normal single-turn reasoning path). Reuses the same
 * STAGE_SIGNALS the heuristic planner decomposes objectives with, so
 * "does this look like a mission" and "how would we break it down" never
 * disagree with each other.
 *
 * Deliberately conservative — requires at least two distinct stage
 * signals (or an explicit mission phrase) so an ordinary single-tool
 * request like "what's the weather in Paris" or "remember my favorite
 * color" never gets proposed as a mission.
 */
export function looksLikeMissionObjective(text: string): boolean {
  if (EXPLICIT_MISSION_PHRASES.test(text)) return true;
  const matchedStages = STAGE_SIGNALS.filter((s) => s.test.test(text)).length;
  if (matchedStages >= 2) return true;
  if (matchedStages >= 1 && REPORT_PHRASES.test(text)) return true;
  return false;
}
