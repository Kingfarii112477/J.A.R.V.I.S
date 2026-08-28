/** Failure taxonomy driving lib/execution/failureRecovery.ts's recovery
 * decision — which categories are worth retrying, which should block
 * dependents, and which must pause the mission for human input. */
export type FailureCategory =
  | "TRANSIENT"
  | "PERMISSION"
  | "VALIDATION"
  | "TIMEOUT"
  | "NETWORK"
  | "TOOL"
  | "MODEL"
  | "DEPENDENCY"
  | "SECURITY"
  | "UNKNOWN";

export interface TaskExecutionResult {
  ok: boolean;
  taskId: string;
  output?: string;
  error?: string;
  failureCategory?: FailureCategory;
  toolCallCount: number;
  iterations: number;
  latencyMs: number;
  /** Set when the task's ReasoningEngine run paused on a CONFIRM-level
   * tool that autonomy policy couldn't auto-approve — the orchestrator
   * surfaces this as an approval request rather than a failure. */
  needsApproval?: { toolName: string; args: unknown; callId: string };
}
