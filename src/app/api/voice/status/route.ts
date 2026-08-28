import { NextResponse } from "next/server";

export const runtime = "nodejs";

/** One consolidated status check for the Settings screen's Voice &
 * Language section — never reveals the keys themselves, only whether
 * each is configured, mirroring the same-shaped checks already exposed
 * individually by GET /api/voice/transcribe and GET /api/voice/speak. */
export async function GET() {
  return NextResponse.json({
    stt: {
      whisper: { available: Boolean(process.env.OPENAI_API_KEY) },
      assemblyai: { available: Boolean(process.env.ASSEMBLYAI_API_KEY) },
    },
    tts: {
      openai: { available: Boolean(process.env.OPENAI_API_KEY) },
      elevenlabs: { available: Boolean(process.env.ELEVENLABS_API_KEY) },
      azure: { available: Boolean(process.env.AZURE_SPEECH_KEY && process.env.AZURE_SPEECH_REGION) },
    },
  });
}
