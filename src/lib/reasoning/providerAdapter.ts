import "server-only";
import type { ReasoningMessage, ReasoningStreamEvent, ReasoningToolSchema } from "./types";
import type { ResolvedProviderConfig } from "@/lib/ai";
import { describeProviderFailure } from "@/lib/ai/providerError";

/** Converts this app's internal ReasoningMessage shape into the OpenAI
 * "tools" chat-completions wire format that OpenRouter/Groq/most
 * OpenAI-compatible gateways all speak. */
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

function toWireTools(tools: ReasoningToolSchema[]) {
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
 * Streams one model turn from a tool-calling-capable OpenAI-compatible
 * provider, yielding structured ReasoningStreamEvents rather than raw
 * text — the reasoning engine's single-LLM-call primitive. Tool-call
 * argument fragments arrive across many SSE chunks (one JSON string
 * built up character-by-character per tool-call index); this accumulates
 * them and only emits a `tool_call` event once the stream signals the
 * turn is complete, since a partial JSON string can't be parsed safely.
 * Never throws — every failure mode becomes an `error` event so the
 * reasoning loop can react to it instead of the request handler crashing.
 */
export async function* streamReasoningTurn(
  provider: ResolvedProviderConfig,
  messages: ReasoningMessage[],
  tools: ReasoningToolSchema[]
): AsyncGenerator<ReasoningStreamEvent, void, unknown> {
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
      signal: AbortSignal.timeout(45_000),
    });
  } catch (err) {
    yield { type: "error", message: err instanceof Error ? err.message : "Network error contacting the AI provider." };
    return;
  }

  if (!res.ok || !res.body) {
    const body = await res.text().catch(() => "");
    yield { type: "error", message: describeProviderFailure(res.status, body) };
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const toolCallAcc = new Map<number, ToolCallAccumulator>();
  let finishReason: string | null = null;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (data === "[DONE]") continue;

        let json: {
          choices?: {
            delta?: { content?: string; tool_calls?: { index?: number; id?: string; function?: { name?: string; arguments?: string } }[] };
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

        if (typeof delta.content === "string" && delta.content) {
          yield { type: "text", delta: delta.content };
        }

        if (Array.isArray(delta.tool_calls)) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index ?? 0;
            const entry = toolCallAcc.get(idx) ?? { argsText: "" };
            if (tc.id) entry.id = tc.id;
            if (tc.function?.name) entry.name = tc.function.name;
            if (typeof tc.function?.arguments === "string") entry.argsText += tc.function.arguments;
            toolCallAcc.set(idx, entry);
          }
        }

        if (choice.finish_reason) finishReason = choice.finish_reason;
      }
    }
  } catch (err) {
    yield { type: "error", message: err instanceof Error ? err.message : "The AI provider connection was interrupted." };
    return;
  }

  for (const [idx, entry] of toolCallAcc) {
    const callId = entry.id ?? `call_${idx}`;
    const toolName = entry.name ?? "unknown";
    const argsRaw = entry.argsText || "{}";
    try {
      const args = argsRaw.trim() ? JSON.parse(argsRaw) : {};
      yield { type: "tool_call", callId, toolName, args, argsRaw };
    } catch {
      yield { type: "tool_call_error", callId, toolName, message: `Model produced malformed JSON arguments for "${toolName}".` };
    }
  }

  yield { type: "done", finishReason: finishReason === "tool_calls" ? "tool_calls" : "stop" };
}
