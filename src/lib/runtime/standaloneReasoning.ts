"use client";

import type { ReasoningMessage, ReasoningStreamEvent } from "@/lib/reasoning/types";
import type { ToolSchemaForModel } from "@/lib/tools/schema";
import { resolveStandaloneProvider, describeStandaloneFailure } from "./providerConfig";

/**
 * The standalone twin of lib/reasoning/providerAdapter.ts.
 *
 * Same wire format, same event shapes, same never-throw contract — the
 * ReasoningEngine loop above it cannot tell which transport produced the
 * events, so tool calling, governance, confirmations and the audit log
 * all behave identically with no server involved.
 *
 * The one genuine behavioural difference is streaming granularity:
 * CapacitorHttp's patched fetch resolves a complete body rather than a
 * progressive ReadableStream, so text arrives as one event per response
 * instead of token-by-token. Tool calls are unaffected, since those can
 * only be acted on once the turn completes anyway.
 */

function toWireMessages(messages: ReasoningMessage[]): Record<string, unknown>[] {
  return messages.map((m) => {
    if (m.role === "assistant") {
      return {
        role: "assistant",
        content: m.content,
        ...(m.toolCalls && m.toolCalls.length > 0
          ? {
              tool_calls: m.toolCalls.map((tc) => ({
                id: tc.callId,
                type: "function",
                function: { name: tc.toolName, arguments: tc.argsRaw },
              })),
            }
          : {}),
      };
    }
    if (m.role === "tool") {
      return { role: "tool", tool_call_id: m.toolCallId, content: m.content };
    }
    return { role: m.role, content: m.content };
  });
}

function toWireTools(tools: ToolSchemaForModel[]) {
  return tools.map((t) => ({
    type: "function",
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));
}

interface ToolCallAccumulator {
  id?: string;
  name?: string;
  argsText: string;
}

/**
 * Parses a full SSE completion payload into reasoning events.
 *
 * Exported for testing: this accumulation — tool-call arguments arrive
 * split across many chunks and are only parseable once complete — is
 * where the subtle bugs live, so it is unit tested directly rather than
 * only through a live provider.
 */
export function parseReasoningPayload(payload: string): ReasoningStreamEvent[] {
  const events: ReasoningStreamEvent[] = [];
  const toolCalls = new Map<number, ToolCallAccumulator>();
  let text = "";
  let finishReason: string | null = null;

  for (const rawLine of payload.split("\n")) {
    const line = rawLine.trim();
    if (!line.startsWith("data:")) continue;
    const data = line.slice(5).trim();
    if (!data || data === "[DONE]") continue;

    let json: {
      choices?: {
        delta?: {
          content?: string;
          tool_calls?: { index?: number; id?: string; function?: { name?: string; arguments?: string } }[];
        };
        finish_reason?: string;
      }[];
    };
    try {
      json = JSON.parse(data);
    } catch {
      continue;
    }

    const choice = json.choices?.[0];
    if (!choice) continue;
    const delta = choice.delta ?? {};

    if (typeof delta.content === "string" && delta.content) text += delta.content;

    if (Array.isArray(delta.tool_calls)) {
      for (const tc of delta.tool_calls) {
        const idx = tc.index ?? 0;
        const entry = toolCalls.get(idx) ?? { argsText: "" };
        if (tc.id) entry.id = tc.id;
        if (tc.function?.name) entry.name = tc.function.name;
        if (typeof tc.function?.arguments === "string") entry.argsText += tc.function.arguments;
        toolCalls.set(idx, entry);
      }
    }

    if (choice.finish_reason) finishReason = choice.finish_reason;
  }

  if (text) events.push({ type: "text", delta: text });

  for (const [idx, entry] of toolCalls) {
    const callId = entry.id ?? `call_${idx}`;
    const toolName = entry.name ?? "unknown";
    const argsRaw = entry.argsText || "{}";
    try {
      const args = argsRaw.trim() ? JSON.parse(argsRaw) : {};
      events.push({ type: "tool_call", callId, toolName, args, argsRaw });
    } catch {
      events.push({
        type: "tool_call_error",
        callId,
        toolName,
        message: `Model produced malformed JSON arguments for "${toolName}".`,
      });
    }
  }

  events.push({ type: "done", finishReason: finishReason === "tool_calls" ? "tool_calls" : "stop" });
  return events;
}

/** Never throws: every failure becomes an `error` event, exactly like
 * the server adapter, so the reasoning loop can react instead of the
 * caller crashing. */
export async function* streamStandaloneReasoning(
  messages: ReasoningMessage[],
  tools: ToolSchemaForModel[],
  signal?: AbortSignal,
  onMeta?: (meta: { providerId: string; model: string }) => void
): AsyncGenerator<ReasoningStreamEvent, void, unknown> {
  const provider = await resolveStandaloneProvider();
  if (!provider) {
    yield {
      type: "error",
      message: "No AI provider is configured. Add an API key in Settings → AI Providers.",
    };
    return;
  }
  onMeta?.({ providerId: provider.providerId, model: provider.model });

  let res: Response;
  try {
    res = await fetch(`${provider.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${provider.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: provider.model,
        messages: toWireMessages(messages),
        ...(tools.length > 0 ? { tools: toWireTools(tools), tool_choice: "auto" } : {}),
        stream: true,
        temperature: 0.4,
      }),
      signal,
    });
  } catch (err) {
    yield {
      type: "error",
      message: err instanceof Error ? err.message : "Network error contacting the AI provider.",
    };
    return;
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    yield { type: "error", message: describeStandaloneFailure(res.status, body) };
    return;
  }

  let payload: string;
  try {
    payload = await res.text();
  } catch (err) {
    yield {
      type: "error",
      message: err instanceof Error ? err.message : "The AI provider connection was interrupted.",
    };
    return;
  }

  for (const event of parseReasoningPayload(payload)) yield event;
}
