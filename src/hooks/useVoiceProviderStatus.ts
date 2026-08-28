"use client";

import { useEffect, useState } from "react";
import { useJarvisStore } from "@/store/jarvisStore";
import { getSTTProvider } from "@/lib/voice/stt";
import { browserTTSProvider } from "@/lib/voice/tts";

export type VoiceProviderStatus = "REAL" | "FALLBACK" | "UNAVAILABLE";

interface VoiceStatusResponse {
  stt: { whisper: { available: boolean }; assemblyai: { available: boolean } };
  tts: { openai: { available: boolean }; elevenlabs: { available: boolean }; azure: { available: boolean } };
}

/** One place both the Voice Command Center and Settings → Voice & Language
 * read the real STT/TTS provider connection state from — never fabricated,
 * always a genuine GET /api/voice/status result (which itself never
 * reveals key values, only whether each is configured). "FALLBACK" means
 * the selected server provider isn't configured, so the app is silently
 * (but visibly, via this badge) using the browser's built-in provider
 * instead — see lib/voice/stt/manager.ts and lib/voice/tts/manager.ts. */
export function useVoiceProviderStatus() {
  const sttProvider = useJarvisStore((s) => s.settings.sttProvider);
  const ttsProvider = useJarvisStore((s) => s.settings.ttsProvider);
  const [data, setData] = useState<VoiceStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch("/api/voice/status")
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (!cancelled) setData(json);
      })
      .catch(() => {
        if (!cancelled) setData(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const browserSTTSupported = getSTTProvider("browser").isSupported();
  const browserTTSSupported = browserTTSProvider.isAvailable();

  function sttStatus(): VoiceProviderStatus {
    if (sttProvider === "browser") return browserSTTSupported ? "REAL" : "UNAVAILABLE";
    const available = sttProvider === "whisper" ? data?.stt.whisper.available : data?.stt.assemblyai.available;
    if (available) return "REAL";
    return browserSTTSupported ? "FALLBACK" : "UNAVAILABLE";
  }

  function ttsStatus(): VoiceProviderStatus {
    if (ttsProvider === "browser") return browserTTSSupported ? "REAL" : "UNAVAILABLE";
    const available =
      ttsProvider === "openai" ? data?.tts.openai.available : ttsProvider === "elevenlabs" ? data?.tts.elevenlabs.available : data?.tts.azure.available;
    if (available) return "REAL";
    return browserTTSSupported ? "FALLBACK" : "UNAVAILABLE";
  }

  return {
    loading,
    sttStatus: sttStatus(),
    ttsStatus: ttsStatus(),
    raw: data,
  };
}
