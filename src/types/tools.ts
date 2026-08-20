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
}

export interface ToolCallState {
  callId: string;
  toolName: string;
  status: "pending_confirmation" | "running" | "success" | "error";
  summary?: string;
  error?: string;
}
