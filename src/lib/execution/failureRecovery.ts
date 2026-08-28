import type { FailureCategory } from "./executionResult";
import { shouldRetry } from "./retryPolicy";

export type RecoveryAction = "RETRY" | "FAIL" | "PAUSE_FOR_APPROVAL";

/** Classifies a ReasoningEngine stop reason + error message into the
 * failure taxonomy the orchestrator's recovery decision is based on.
 * Deliberately conservative: an ambiguous message falls to MODEL/UNKNOWN
 * rather than guessing TRANSIENT, since only TRANSIENT/NETWORK/TIMEOUT
 * are ever auto-retried. */
export function classifyFailure(stoppedReason: string, errorMessage?: string): FailureCategory {
  if (stoppedReason === "timeout") return "TIMEOUT";
  if (stoppedReason !== "error") return "UNKNOWN";

  const msg = (errorMessage ?? "").toLowerCase();
  if (/network|fetch failed|econnrefused|connection (was )?(interrupted|reset|lost)/i.test(msg)) return "NETWORK";
  if (/permission|denied|unauthorized|not authorized/i.test(msg)) return "PERMISSION";
  if (/timed? ?out/i.test(msg)) return "TIMEOUT";
  if (/invalid parameters|validation|zod/i.test(msg)) return "VALIDATION";
  if (/tool ".*" (timed out|failed)|unknown tool/i.test(msg)) return "TOOL";
  if (/secret|credential|unsafe|blocked/i.test(msg)) return "SECURITY";
  return "MODEL";
}

/**
 * Transient (TIMEOUT/NETWORK) failures retry with exponential backoff up
 * to the mission's budget; a genuine permission failure pauses for human
 * authorization rather than retrying blindly; everything else (a real
 * validation/tool/model/dependency/security/unknown failure) is
 * permanent — retrying it would just reproduce the same failure, so it
 * fails outright and lets the replanner decide whether the rest of the
 * mission can still proceed without it.
 */
export function decideRecoveryAction(category: FailureCategory, retryCount: number, maxRetries: number): RecoveryAction {
  if (category === "TRANSIENT" || category === "NETWORK" || category === "TIMEOUT") {
    return shouldRetry(retryCount, maxRetries) ? "RETRY" : "FAIL";
  }
  if (category === "PERMISSION" || category === "SECURITY") return "PAUSE_FOR_APPROVAL";
  return "FAIL";
}
