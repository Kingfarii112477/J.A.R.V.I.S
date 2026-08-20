import { NextResponse } from "next/server";

export const runtime = "nodejs";

/** Lets the client know whether a real AI backend is configured, without
 * revealing which one or leaking any credentials. */
export async function GET() {
  const hasProvider = Boolean(
    process.env.OPENROUTER_API_KEY ||
      process.env.GROQ_API_KEY ||
      (process.env.OPENAI_COMPATIBLE_API_KEY && process.env.OPENAI_COMPATIBLE_BASE_URL) ||
      process.env.N8N_WEBHOOK_URL ||
      process.env.NEXT_PUBLIC_N8N_WEBHOOK
  );

  return NextResponse.json({
    status: "ok",
    aiConnection: hasProvider ? "connected" : "demo",
  });
}
