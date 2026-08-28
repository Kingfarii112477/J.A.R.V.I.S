import { NextResponse } from "next/server";
import { z } from "zod";
import { voiceRateLimiter, rateLimitResponse } from "@/lib/security/rateLimit";
import { voiceProfileForLanguage, resolveAzureVoice, localeForAzureVoice } from "@/lib/voice/tts/voiceProfiles";
import type { LanguageCode } from "@/lib/voice/language/types";

export const runtime = "nodejs";

const languageCodeSchema = z.enum(["en", "ur", "hi", "roman-ur", "hinglish", "mixed"]).optional();

const requestSchema = z.object({
  text: z.string().min(1).max(4000),
  provider: z.enum(["openai", "elevenlabs", "azure"]),
  languageHint: languageCodeSchema,
});

function azureConfigured() {
  return Boolean(process.env.AZURE_SPEECH_KEY && process.env.AZURE_SPEECH_REGION);
}

/** Never reveals the keys themselves — only whether each is set — so the
 * Settings screen can show a real CONNECTED / NOT CONFIGURED badge. */
export async function GET() {
  return NextResponse.json({
    openai: { available: Boolean(process.env.OPENAI_API_KEY) },
    elevenlabs: { available: Boolean(process.env.ELEVENLABS_API_KEY) },
    azure: { available: azureConfigured() },
  });
}

function escapeSsml(text: string) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

/** Azure AI Speech REST synthesis — https://{region}.tts.speech.microsoft.com,
 * NOT the AZURE_SPEECH_ENDPOINT value (that's the Cognitive Services token/
 * management endpoint pattern; the region-based TTS host is the one that
 * actually accepts /cognitiveservices/v1 synthesis requests with the
 * subscription key directly — verified against this project's own Azure
 * resource before being hard-coded here). */
async function synthesizeWithAzure(text: string, languageHint?: LanguageCode) {
  const apiKey = process.env.AZURE_SPEECH_KEY!;
  const region = process.env.AZURE_SPEECH_REGION!;
  const profile = voiceProfileForLanguage(languageHint);
  const voice = resolveAzureVoice(profile);
  const locale = localeForAzureVoice(voice);

  const ssml = `<speak version="1.0" xml:lang="${locale}"><voice name="${voice}">${escapeSsml(text)}</voice></speak>`;

  const res = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
    method: "POST",
    headers: {
      "Ocp-Apim-Subscription-Key": apiKey,
      "Content-Type": "application/ssml+xml",
      "X-Microsoft-OutputFormat": "audio-16khz-128kbitrate-mono-mp3",
      "User-Agent": "jarvis-os",
    },
    body: ssml,
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    return NextResponse.json({ error: `Azure Speech request failed (${res.status}).`, detail: errBody.slice(0, 300) }, { status: 502 });
  }
  const buffer = await res.arrayBuffer();
  return new NextResponse(buffer, { headers: { "Content-Type": "audio/mpeg" } });
}

/** Text-to-speech: returns raw audio bytes from OpenAI TTS or ElevenLabs.
 * Returns 501 with `unavailable: true` — never silent, never a fabricated
 * clip — when the requested provider has no server key. */
export async function POST(request: Request) {
  const limited = rateLimitResponse(voiceRateLimiter, request);
  if (limited) return limited;

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
  const { text, provider, languageHint } = parsed.data;

  if (provider === "azure") {
    if (!azureConfigured()) {
      return NextResponse.json({ unavailable: true, message: "Azure Speech is not configured on the server." }, { status: 501 });
    }
    try {
      return await synthesizeWithAzure(text, languageHint);
    } catch (err) {
      return NextResponse.json(
        { error: "Azure Speech request failed.", detail: err instanceof Error ? err.message : "Unknown error" },
        { status: 502 }
      );
    }
  }

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
