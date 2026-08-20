import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";

const requestSchema = z.object({
  text: z.string().min(1).max(4000),
  provider: z.enum(["openai", "elevenlabs"]),
});

/** Never reveals the keys themselves — only whether each is set — so the
 * Settings screen can show a real CONNECTED / NOT CONFIGURED badge. */
export async function GET() {
  return NextResponse.json({
    openai: { available: Boolean(process.env.OPENAI_API_KEY) },
    elevenlabs: { available: Boolean(process.env.ELEVENLABS_API_KEY) },
  });
}

/** Text-to-speech: returns raw audio bytes from OpenAI TTS or ElevenLabs.
 * Returns 501 with `unavailable: true` — never silent, never a fabricated
 * clip — when the requested provider has no server key. */
export async function POST(request: Request) {
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
  const { text, provider } = parsed.data;

  if (provider === "openai") {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ unavailable: true, message: "OpenAI TTS is not configured on the server." }, { status: 501 });
    }
    try {
      const res = await fetch("https://api.openai.com/v1/audio/speech", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "tts-1", voice: process.env.OPENAI_TTS_VOICE || "alloy", input: text }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) {
        const errBody = await res.text().catch(() => "");
        return NextResponse.json({ error: `OpenAI TTS failed (${res.status}).`, detail: errBody.slice(0, 300) }, { status: 502 });
      }
      const buffer = await res.arrayBuffer();
      return new NextResponse(buffer, { headers: { "Content-Type": "audio/mpeg" } });
    } catch (err) {
      return NextResponse.json(
        { error: "OpenAI TTS request failed.", detail: err instanceof Error ? err.message : "Unknown error" },
        { status: 502 }
      );
    }
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ unavailable: true, message: "ElevenLabs is not configured on the server." }, { status: 501 });
  }
  const voiceId = process.env.ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM";
  try {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: "POST",
      headers: { "xi-api-key": apiKey, "Content-Type": "application/json", Accept: "audio/mpeg" },
      body: JSON.stringify({ text, model_id: "eleven_monolingual_v1" }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      return NextResponse.json({ error: `ElevenLabs request failed (${res.status}).`, detail: errBody.slice(0, 300) }, { status: 502 });
    }
    const buffer = await res.arrayBuffer();
    return new NextResponse(buffer, { headers: { "Content-Type": "audio/mpeg" } });
  } catch (err) {
    return NextResponse.json(
      { error: "ElevenLabs request failed.", detail: err instanceof Error ? err.message : "Unknown error" },
      { status: 502 }
    );
  }
}
