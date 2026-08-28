import type { ReasoningMessage, ReasoningStreamEvent } from "./types";
import type { ToolSchemaForModel } from "@/lib/tools/schema";

/**
 * Client-side reader for /api/reasoning's newline-delimited JSON stream —
 * the one-LLM-call primitive the ReasoningEngine loops over. Mirrors how
 * useAI.ts already reads /api/chat's plain-text stream, just parsing each
 * line into a typed event instead of yielding raw text.
 */
export async function* streamReasoningEndpoint(
  messages: ReasoningMessage[],
  tools: ToolSchemaForModel[],
  sessionId: string,
  signal?: AbortSignal,
  /** Fired once, synchronously after the response headers arrive (before
   * the body is read) — purely for observability (the dev reasoning
   * monitor), never load-bearing for the reasoning loop itself. */
  onMeta?: (meta: { providerId: string; model: string }) => void
): AsyncGenerator<ReasoningStreamEvent, void, unknown> {
  const res = await fetch("/api/reasoning", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, tools, sessionId }),
    signal,
  });

  if (!res.ok || !res.body) {
    const data = await res.json().catch(() => ({}) as { error?: string });
    yield { type: "error", message: data.error ?? `Reasoning request failed (${res.status}).` };
    return;
  }

  onMeta?.({ providerId: res.headers.get("X-AI-Provider") ?? "unknown", model: res.headers.get("X-AI-Model") ?? "unknown" });

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        yield JSON.parse(line) as ReasoningStreamEvent;
      } catch {
        // A malformed NDJSON line shouldn't happen server-side, but skip
        // rather than crash the reasoning loop if it ever does.
      }
    }
  }
  if (buffer.trim()) {
    try {
      yield JSON.parse(buffer) as ReasoningStreamEvent;
    } catch {
      // Trailing partial line with nowhere left to complete it — ignore.
    }
  }
}
