import { z } from "zod";
import { resolveProviderConfig } from "@/lib/ai";
import { classifyIntent } from "@/lib/ai/router";
import { streamReasoningTurn } from "@/lib/reasoning/providerAdapter";
import type { ReasoningMessage, ReasoningStreamEvent } from "@/lib/reasoning/types";

export const runtime = "nodejs";

const toolCallSchema = z.object({
  callId: z.string().min(1).max(100),
  toolName: z.string().min(1).max(80),
  argsRaw: z.string().max(4000),
  args: z.unknown(),
});

const messageSchema = z.discriminatedUnion("role", [
  z.object({ role: z.literal("system"), content: z.string().max(8000) }),
  z.object({ role: z.literal("user"), content: z.string().max(4000) }),
  z.object({ role: z.literal("assistant"), content: z.string().max(4000).nullable(), toolCalls: z.array(toolCallSchema).max(10).optional() }),
  z.object({ role: z.literal("tool"), toolCallId: z.string().min(1).max(100), toolName: z.string().min(1).max(80), content: z.string().max(4000) }),
]);

const toolSchema = z.object({
  name: z.string().min(1).max(80),
  description: z.string().min(1).max(500),
  parameters: z.record(z.string(), z.unknown()),
});

const requestSchema = z.object({
  messages: z.array(messageSchema).min(1).max(80),
  tools: z.array(toolSchema).max(30).default([]),
  sessionId: z.string().min(1).max(200),
});

/**
 * Single-turn primitive for the reasoning engine — NOT a looping agent
 * itself. Given the running conversation (including any prior tool
 * results) and the available tool schemas, this calls a tool-calling-
 * capable provider once and streams back structured events (text deltas,
 * complete tool calls, or an error) as newline-delimited JSON. The
 * multi-step loop — deciding whether to call this again after executing
 * a tool — lives client-side in lib/reasoning/engine.ts, for the same
 * reason tool execution does: it needs the browser (localStorage-backed
 * memory, client-side navigation, the Zustand store).
 *
 * When no tool-calling-capable provider is configured (OPENROUTER_API_KEY
 * / GROQ_API_KEY / OPENAI_COMPATIBLE_API_KEY+BASE_URL all unset — e.g.
 * n8n-only or demo-mode deployments), this emits a single `fallback`
 * event and closes immediately. The client then drops back to the
 * existing deterministic dispatcher/tool-router/plain-streaming path
 * (lib/tools/router.ts + /api/chat) completely unchanged.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid request.", details: parsed.error.flatten() }, { status: 400 });
  }

  const { messages, tools } = parsed.data as { messages: ReasoningMessage[]; tools: { name: string; description: string; parameters: Record<string, unknown> }[] };

  const lastUserMessage = [...messages].reverse().find((m) => m.role === "user");
  const intent = classifyIntent(lastUserMessage?.content ?? "");
  const provider = resolveProviderConfig(intent);

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      function emit(event: ReasoningStreamEvent) {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      }

      if (!provider) {
        emit({ type: "fallback" });
        controller.close();
        return;
      }

      try {
        for await (const event of streamReasoningTurn(provider, messages, tools)) {
          emit(event);
        }
      } catch (err) {
        emit({ type: "error", message: err instanceof Error ? err.message : "Unknown reasoning error." });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "X-AI-Provider": provider?.providerId ?? "none",
      "Cache-Control": "no-store",
    },
  });
}
