import type { z } from "zod";

export type PermissionLevel = "SAFE" | "CONFIRM" | "RESTRICTED" | "ADMIN";

export interface ToolExecutionContext {
  sessionId: string;
  source: "chat" | "voice" | "terminal" | "button" | "automation";
  navigate?: (href: string) => void;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- registry stores heterogeneous tools; each individual tool stays fully typed at its definition site.
export interface ToolDefinition<Args = any, Result = any> {
  name: string;
  description: string;
  parameters: z.ZodType<Args>;
  permission: PermissionLevel;
  requiresConfirmation: boolean;
  execute: (args: Args, ctx: ToolExecutionContext) => Promise<Result>;
  /** Short natural-language summary of the result — shown in the chat
   * ToolCallCard and used as the deterministic response wrapper (see
   * useMessagePipeline's tool-router path). */
  formatResult: (result: Result) => string;
  /** One-line risk description shown on the confirmation card for any
   * tool that requires authorization — e.g. "Permanent deletion; cannot
   * be undone." Only meaningful (and only ever shown) when permission is
   * CONFIRM/RESTRICTED/ADMIN; a SAFE tool never prompts for confirmation
   * so this is never read for one. */
  riskNote?: string;

  // ---- Phase 4 tool governance metadata (all optional — see
  // lib/tools/governance.ts for the defaults applied when a tool
  // doesn't set these explicitly, derived from `permission`). Real
  // enforcement of *who* may call a tool still lives in
  // AgentDefinition.allowedTools and AutonomyPolicy, not here — these
  // fields are descriptive risk metadata for governance displays and
  // recovery/budget decisions, never a second source of truth that
  // could silently disagree with the registries that actually gate
  // execution. ----
  /** Explicit risk tier. Defaults from `permission` when unset:
   * SAFE→LOW, CONFIRM→MEDIUM, RESTRICTED/ADMIN→HIGH. */
  risk?: "LOW" | "MEDIUM" | "HIGH";
  /** What actually happens when this tool runs. Defaults to "NONE". */
  sideEffects?: "NONE" | "EXTERNAL" | "DESTRUCTIVE";
  /** Whether the effect can be undone. Defaults to true for SAFE tools,
   * false for anything requiring confirmation (a conservative default —
   * an explicit `true` overrides it for a CONFIRM tool that genuinely
   * is undoable). */
  reversible?: boolean;
  /** Free-text cost hint shown in governance displays, e.g. "1 external
   * API request" or "1 workflow execution". Never used for enforcement. */
  costEstimate?: string;
}

export interface ToolCallState {
  callId: string;
  toolName: string;
  status: "pending_confirmation" | "running" | "success" | "error";
  summary?: string;
  error?: string;
}
