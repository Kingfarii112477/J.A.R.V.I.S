/**
 * Message representation for the reasoning engine's conversation with a
 * tool-calling-capable LLM. Deliberately separate from lib/ai/types.ts's
 * simpler AIMessage (user/assistant/system, plain content) — that type
 * still serves the existing plain-text streaming path used by the
 * deterministic fallback untouched. This richer shape is only ever built
 * in memory for one reasoning run; it's never persisted.
 */
export type ReasoningMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | { role: "assistant"; content: string | null; toolCalls?: ReasoningToolCall[] }
  | { role: "tool"; toolCallId: string; toolName: string; content: string };

export interface ReasoningToolCall {
  callId: string;
  toolName: string;
  /** Raw JSON string as the model produced it — kept alongside the parsed
   * `args` so a malformed-JSON tool call can still be round-tripped back
   * into the assistant's own history turn even if execution fails. */
  argsRaw: string;
  args: unknown;
}

/** One line of the NDJSON stream /api/reasoning emits for a single model
 * turn. `fallback` is the very first (and only) event when no
 * tool-calling-capable provider is configured — the client immediately
 * drops back to the existing deterministic dispatcher/router path. */
export type ReasoningStreamEvent =
  | { type: "fallback" }
  | { type: "text"; delta: string }
  | { type: "tool_call"; callId: string; toolName: string; args: unknown; argsRaw: string }
  | { type: "tool_call_error"; callId: string; toolName: string; message: string }
  | { type: "done"; finishReason: "stop" | "tool_calls" }
  | { type: "error"; message: string };

/** A tool exposed to the model, in the shape /api/reasoning needs to
 * convert to each provider's function-calling wire format. */
export interface ReasoningToolSchema {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}
