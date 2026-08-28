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
}

export interface ToolCallState {
  callId: string;
  toolName: string;
  status: "pending_confirmation" | "running" | "success" | "error";
  summary?: string;
  error?: string;
}
