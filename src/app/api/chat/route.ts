import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveAIStream } from "@/lib/ai";

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

  const { message, sessionId, history } = parsed.data;

  let result;
  try {
    result = resolveAIStream(message, history, sessionId);
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
      "Cache-Control": "no-store",
    },
  });
}
