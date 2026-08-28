import { NextResponse } from "next/server";
import { z } from "zod";
import { callN8nWebhook } from "@/lib/ai/providers";
import { toolExecutionRateLimiter, rateLimitResponse } from "@/lib/security/rateLimit";

export const runtime = "nodejs";

const requestSchema = z.object({
  message: z.string().min(1).max(4000),
  sessionId: z.string().min(1).max(200),
});

/**
 * Generic n8n forwarding endpoint, separate from /api/chat. The webhook
 * URL is read server-side only (N8N_WEBHOOK_URL) and never sent to the
 * client — the browser only ever talks to this route.
 */
export async function POST(request: Request) {
  const limited = rateLimitResponse(toolExecutionRateLimiter, request);
  if (limited) return limited;

  const webhookUrl = process.env.N8N_WEBHOOK_URL || process.env.NEXT_PUBLIC_N8N_WEBHOOK;
  if (!webhookUrl) {
    return NextResponse.json({ error: "n8n is not configured on this deployment." }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  try {
    const response = await callN8nWebhook(webhookUrl, {
      message: parsed.data.message,
      sessionId: parsed.data.sessionId,
      timestamp: new Date().toISOString(),
      source: "jarvis-ui",
    });
    return NextResponse.json({ response });
  } catch (err) {
    return NextResponse.json(
      { error: "n8n workflow unavailable.", detail: err instanceof Error ? err.message : "Unknown error" },
      { status: 502 }
    );
  }
}
