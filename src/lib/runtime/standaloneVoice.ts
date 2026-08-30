"use client";

import { getCredential } from "./standalone";
import { resolveAzureVoice, localeForAzureVoice, voiceProfileForLanguage } from "@/lib/voice/tts/voiceProfiles";
import type { LanguageCode } from "@/lib/voice/language/types";

/**
 * Standalone (server-free) speech synthesis and transcription.
 *
 * These mirror what /api/voice/speak and /api/voice/transcribe do
 * server-side, but run on the device using the user's own keys. They
 * deliberately reuse the SAME voice-profile selection the server route
 * uses, so a given language picks the same neural voice on both.
 *
 * Both return `null` when the relevant key isn't configured. That is the
 * standalone equivalent of the routes' HTTP 501, and callers translate
 * it into the existing "unavailable" path — which falls back to the
 * device's built-in speech engine. The practical effect is that the app
 * is fully usable for voice with NO keys at all; adding keys upgrades
 * the quality rather than unlocking the feature.
 */

export type StandaloneVoiceOutcome<T> =
  | { status: "ok"; value: T }
  | { status: "unavailable"; message: string }
  | { status: "error"; message: string };

function escapeSsml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Azure AI Speech REST synthesis, called straight from the device. */
export async function synthesizeStandalone(
  text: string,
  languageHint?: LanguageCode
): Promise<StandaloneVoiceOutcome<Blob>> {
  const key = await getCredential("AZURE_SPEECH_KEY");
  const region = await getCredential("AZURE_SPEECH_REGION");
  if (!key || !region) {
    return {
      status: "unavailable",
      message: "Azure Speech isn't configured — using this device's built-in voice. Add a key in Settings for neural voices.",
    };
  }

  const voice = resolveAzureVoice(voiceProfileForLanguage(languageHint));
  const locale = localeForAzureVoice(voice);
  const ssml = `<speak version="1.0" xml:lang="${locale}"><voice name="${voice}">${escapeSsml(text)}</voice></speak>`;

  try {
    const res = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": key,
        "Content-Type": "application/ssml+xml",
        "X-Microsoft-OutputFormat": "audio-16khz-128kbitrate-mono-mp3",
        "User-Agent": "jarvis-aios",
      },
      body: ssml,
    });
    if (res.status === 401 || res.status === 403) {
      return { status: "error", message: "Azure rejected the speech key — check it in Settings → Voice." };
    }
    if (!res.ok) {
      return { status: "error", message: `Speech synthesis failed (${res.status}).` };
    }
    return { status: "ok", value: await res.blob() };
  } catch (err) {
    return {
      status: "error",
      message: err instanceof Error ? err.message : "Could not reach the speech service.",
    };
  }
}

interface AssemblyTranscript {
  transcript: string;
  confidence?: number;
  detectedLanguageCode?: string;
}

/**
 * AssemblyAI transcription, called straight from the device.
 *
 * Three steps by necessity: upload the audio, request a transcript, then
 * poll until it completes. Polling is bounded so a stuck job surfaces as
 * an error rather than hanging the voice pipeline forever.
 */
export async function transcribeStandalone(
  audio: Blob,
  signal?: AbortSignal
): Promise<StandaloneVoiceOutcome<AssemblyTranscript>> {
  const key = await getCredential("ASSEMBLYAI_API_KEY");
  if (!key) {
    return {
      status: "unavailable",
      message: "AssemblyAI isn't configured — using this device's built-in recognizer. Add a key in Settings for better accuracy.",
    };
  }

  try {
    const upload = await fetch("https://api.assemblyai.com/v2/upload", {
      method: "POST",
      headers: { authorization: key },
      body: audio,
      signal,
    });
    if (upload.status === 401) {
      return { status: "error", message: "AssemblyAI rejected the key — check it in Settings → Voice." };
    }
    if (!upload.ok) return { status: "error", message: `Audio upload failed (${upload.status}).` };
    const { upload_url: uploadUrl } = (await upload.json()) as { upload_url?: string };
    if (!uploadUrl) return { status: "error", message: "AssemblyAI did not return an upload URL." };

    const created = await fetch("https://api.assemblyai.com/v2/transcript", {
      method: "POST",
      headers: { authorization: key, "content-type": "application/json" },
      body: JSON.stringify({ audio_url: uploadUrl, language_detection: true }),
      signal,
    });
    if (!created.ok) return { status: "error", message: `Transcription request failed (${created.status}).` };
    const { id } = (await created.json()) as { id?: string };
    if (!id) return { status: "error", message: "AssemblyAI did not return a transcript id." };

    // ~30s ceiling: long enough for a spoken command, short enough that a
    // stuck job doesn't strand the user mid-turn.
    for (let attempt = 0; attempt < 60; attempt++) {
      if (signal?.aborted) return { status: "error", message: "Transcription cancelled." };
      await new Promise((resolve) => setTimeout(resolve, 500));
      const poll = await fetch(`https://api.assemblyai.com/v2/transcript/${id}`, {
        headers: { authorization: key },
        signal,
      });
      if (!poll.ok) continue;
      const data = (await poll.json()) as {
        status?: string;
        text?: string;
        confidence?: number;
        language_code?: string;
        error?: string;
      };
      if (data.status === "completed") {
        return {
          status: "ok",
          value: {
            transcript: data.text ?? "",
            confidence: data.confidence,
            detectedLanguageCode: data.language_code,
          },
        };
      }
      if (data.status === "error") {
        return { status: "error", message: data.error ?? "Transcription failed." };
      }
    }
    return { status: "error", message: "Transcription timed out." };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return { status: "error", message: "Transcription cancelled." };
    }
    return {
      status: "error",
      message: err instanceof Error ? err.message : "Could not reach the transcription service.",
    };
  }
}

/** Which voice providers are actually usable on this device — the
 * standalone answer to /api/voice/status. */
export async function standaloneVoiceStatus(): Promise<{ stt: boolean; tts: boolean }> {
  return {
    stt: Boolean(await getCredential("ASSEMBLYAI_API_KEY")),
    tts: Boolean((await getCredential("AZURE_SPEECH_KEY")) && (await getCredential("AZURE_SPEECH_REGION"))),
  };
}
