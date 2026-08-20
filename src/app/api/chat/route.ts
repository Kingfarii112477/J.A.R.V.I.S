import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveAIStream } from "@/lib/ai";
import { classifyIntent } from "@/lib/ai/router";
import { assembleContext } from "@/lib/context/contextEngine";
import { JARVIS_SYSTEM_PROMPT } from "@/config/ai";

export const runtime = "nodejs";

const requestSchema = z.object({
  message: z.string().min(1).max(4000),
  sessionId: z.string().min(1).max(200),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(4000),
      })
    )
    .max(30)
    .optional()
    .default([]),
  // Context-engine inputs (all optional — chat still works without them,
  // e.g. from older clients or the demo path).
  screen: z.string().max(60).optional().default("chat"),
  jarvisState: z.string().max(30).optional().default("THINKING"),
  addressUser: z.string().max(60).optional(),
  verbosity: z.enum(["concise", "balanced", "detailed"]).optional().default("balanced"),
  retrievedMemories: z
    .array(z.object({ content: z.string().max(1000), type: z.string().max(40) }))
    .max(8)
    .optional()
    .default([]),
  activeTaskTitle: z.string().max(200).optional(),
  toolResult: z.object({ toolName: z.string().max(60), summary: z.string().max(1000) }).optional(),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request.", details: parsed.error.flatten() }, { status: 400 });
  }

  const { message, sessionId, history, screen, jarvisState, addressUser, verbosity, retrievedMemories, activeTaskTitle, toolResult } =
    parsed.data;

  const assembled = assembleContext({
    systemPrompt: JARVIS_SYSTEM_PROMPT,
    screen,
    jarvisState,
    aiName: "J.A.R.V.I.S.",
    addressUser,
    verbosity,
    retrievedMemories,
    activeTaskTitle,
    toolResult,
    history,
  });
  const systemPrompt = assembled[0].content;
  const trimmedHistory = assembled.slice(1);

  let result;
  try {
    result = resolveAIStream(message, trimmedHistory, sessionId, systemPrompt);
  } catch (err) {
    return NextResponse.json(
      { error: "AI core connection lost.", detail: err instanceof Error ? err.message : "Unknown error" },
      { status: 502 }
    );
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const chunk of result.stream) {
          controller.enqueue(encoder.encode(chunk));
        }
      } catch (err) {
        controller.enqueue(
          encoder.encode(
            `\n\n[AI CORE CONNECTION LOST — ${err instanceof Error ? err.message : "unknown error"}]`
          )
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "X-AI-Provider": result.providerId,
      "X-AI-Intent": classifyIntent(message),
      "Cache-Control": "no-store",
    },
  });
}
