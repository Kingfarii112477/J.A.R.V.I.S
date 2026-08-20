import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";

const providerSchema = z.enum(["whisper", "assemblyai"]);

function isConfigured(provider: "whisper" | "assemblyai") {
  return provider === "whisper" ? Boolean(process.env.OPENAI_API_KEY) : Boolean(process.env.ASSEMBLYAI_API_KEY);
}

/** Never reveals the keys themselves — only whether each is set — so the
 * Settings screen can show a real CONNECTED / NOT CONFIGURED badge. */
export async function GET() {
  return NextResponse.json({
    whisper: { available: Boolean(process.env.OPENAI_API_KEY) },
    assemblyai: { available: Boolean(process.env.ASSEMBLYAI_API_KEY) },
  });
}

/** Batch speech-to-text: the client records with MediaRecorder and posts
 * the whole clip here on stop (no true streaming interim results with
 * either upstream API). Returns 501 with `unavailable: true` — never a
 * fabricated transcript — when the requested provider has no server key. */
export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data." }, { status: 400 });
  }

  const parsedProvider = providerSchema.safeParse(form.get("provider"));
  if (!parsedProvider.success) {
    return NextResponse.json({ error: "Invalid or missing provider." }, { status: 400 });
  }
  const provider = parsedProvider.data;

  const audio = form.get("audio");
  if (!(audio instanceof Blob) || audio.size === 0) {
    return NextResponse.json({ error: "Missing audio." }, { status: 400 });
  }
  if (audio.size > 20 * 1024 * 1024) {
    return NextResponse.json({ error: "Audio too large (20MB max)." }, { status: 413 });
  }

  if (!isConfigured(provider)) {
    return NextResponse.json(
      {
        unavailable: true,
        message: `${provider === "whisper" ? "Whisper" : "AssemblyAI"} is not configured on the server.`,
      },
      { status: 501 }
    );
  }

  try {
    if (provider === "whisper") {
      const upstreamForm = new FormData();
      upstreamForm.append("file", audio, "speech.webm");
      upstreamForm.append("model", "whisper-1");
      const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
        body: upstreamForm,
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        return NextResponse.json(
          { error: `Whisper request failed (${res.status}).`, detail: body.slice(0, 300) },
          { status: 502 }
        );
      }
      const data = await res.json();
      return NextResponse.json({ transcript: data.text ?? "" });
    }

    return await transcribeWithAssemblyAI(audio);
  } catch (err) {
    return NextResponse.json(
      { error: "Transcription request failed.", detail: err instanceof Error ? err.message : "Unknown error" },
      { status: 502 }
    );
  }
}

async function transcribeWithAssemblyAI(audio: Blob) {
  const apiKey = process.env.ASSEMBLYAI_API_KEY!;
  const audioBuffer = await audio.arrayBuffer();

  const uploadRes = await fetch("https://api.assemblyai.com/v2/upload", {
    method: "POST",
    headers: { Authorization: apiKey },
    body: audioBuffer,
    signal: AbortSignal.timeout(30_000),
  });
  if (!uploadRes.ok) {
    return NextResponse.json({ error: `AssemblyAI upload failed (${uploadRes.status}).` }, { status: 502 });
  }
  const { upload_url: uploadUrl } = await uploadRes.json();

  const transcriptRes = await fetch("https://api.assemblyai.com/v2/transcript", {
    method: "POST",
    headers: { Authorization: apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ audio_url: uploadUrl }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!transcriptRes.ok) {
    return NextResponse.json({ error: `AssemblyAI transcript request failed (${transcriptRes.status}).` }, { status: 502 });
  }
  const { id } = await transcriptRes.json();

  const deadline = Date.now() + 25_000;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const pollRes = await fetch(`https://api.assemblyai.com/v2/transcript/${id}`, {
      headers: { Authorization: apiKey },
      signal: AbortSignal.timeout(10_000),
    });
    if (!pollRes.ok) continue;
    const poll = await pollRes.json();
    if (poll.status === "completed") {
      return NextResponse.json({ transcript: poll.text ?? "", confidence: poll.confidence });
    }
    if (poll.status === "error") {
      return NextResponse.json({ error: poll.error ?? "AssemblyAI transcription failed." }, { status: 502 });
    }
  }
  return NextResponse.json({ error: "AssemblyAI transcription timed out." }, { status: 504 });
}
