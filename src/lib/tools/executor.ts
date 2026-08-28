import { generateId } from "@/lib/utils/id";
import { eventBus } from "@/lib/events/bus";
import { toolRegistry } from "./registry";
import { logAuditEvent } from "@/lib/security/auditLog";
import { useJarvisStore } from "@/store/jarvisStore";
import type { ToolExecutionContext } from "@/types/tools";

export interface ExecuteToolResult {
  ok: boolean;
  callId: string;
  toolName: string;
  result?: unknown;
  summary?: string;
  error?: string;
  needsConfirmation?: boolean;
  /** Set only when a pending confirmation was explicitly declined by the
   * user — distinguishes "the user said no" from any other failure so a
   * caller can show a neutral "cancelled" status instead of an error. */
  cancelled?: boolean;
}

/**
 * The single execution path for every tool call, regardless of whether it
 * originated from chat, voice, the terminal, or a button. Enforces
 * permission levels — RESTRICTED and ADMIN tools are never reachable
 * through the normal chat/voice/terminal router (see
 * lib/tools/router.ts), and any CONFIRM-level tool (or any tool at all,
 * when settings.strictToolConfirmation is on) returns
 * `needsConfirmation: true` instead of running until the caller re-invokes
 * with `confirmed: true` — the AI/dispatcher can request a tool, but it
 * cannot make itself skip confirmation.
 */
export async function executeTool(
  toolName: string,
  rawArgs: unknown,
  ctx: ToolExecutionContext,
  confirmed = false,
  /** Lets a caller that already has its own correlation id (the
   * ReasoningEngine uses the model's tool_call id) keep `tool.started` /
   * `tool.completed` events matched to the `tool.requested` event it
   * already emitted under that same id. Omitted by every other caller
   * (the deterministic dispatcher/router, the terminal), which have no
   * such id and get one generated as before. */
  externalCallId?: string
): Promise<ExecuteToolResult> {
  const callId = externalCallId ?? generateId("tool");
  const tool = toolRegistry.get(toolName);

  if (!tool) {
    return { ok: false, callId, toolName, error: `Unknown tool "${toolName}".` };
  }

  const parsed = tool.parameters.safeParse(rawArgs);
  if (!parsed.success) {
    return { ok: false, callId, toolName, error: `Invalid parameters for ${toolName}: ${parsed.error.issues[0]?.message ?? "validation failed"}` };
  }

  const strict = useJarvisStore.getState().settings.strictToolConfirmation;
  const mustConfirm = tool.requiresConfirmation || tool.permission !== "SAFE" || strict;
  if (mustConfirm && !confirmed) {
    return { ok: false, callId, toolName, needsConfirmation: true };
  }

  const startedAt = performance.now();
  eventBus.emit("tool.started", { toolName, callId, params: parsed.data });

  try {
    const result = await tool.execute(parsed.data, ctx);
    const summary = tool.formatResult(result);
    const latencyMs = Math.round(performance.now() - startedAt);
    eventBus.emit("tool.completed", { toolName, callId, result, success: true, latencyMs });
    logAuditEvent({ type: "TOOL_EXECUTION", source: ctx.source, result: "success", detail: toolName });
    return { ok: true, callId, toolName, result, summary };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Tool execution failed.";
    const latencyMs = Math.round(performance.now() - startedAt);
    eventBus.emit("tool.completed", { toolName, callId, result: null, success: false, latencyMs });
    logAuditEvent({ type: "TOOL_EXECUTION", source: ctx.source, result: "error", detail: toolName });
    return { ok: false, callId, toolName, error: message };
  }
}
