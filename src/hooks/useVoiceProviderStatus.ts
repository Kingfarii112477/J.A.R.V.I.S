"use client";

import { useEffect, useState } from "react";
import { useJarvisStore } from "@/store/jarvisStore";
import { getSTTProvider } from "@/lib/voice/stt";
import { browserTTSProvider } from "@/lib/voice/tts";
import { isStandalone } from "@/lib/runtime/standalone";

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

    void (async () => {
      // Standalone Android: no /api/voice/status exists, so report which
      // providers are usable from the on-device credential store. This
      // REPLACES the fetch rather than racing it — an unconditional
      // fetch would 404 on device and overwrite the real answer.
      if (isStandalone()) {
        const { standaloneVoiceStatus } = await import("@/lib/runtime/standaloneVoice");
        const { stt, tts } = await standaloneVoiceStatus();
        if (cancelled) return;
        setData({
          // Only the providers the standalone app implements directly
          // are reported available; the rest are honestly false rather
          // than silently omitted.
          stt: { assemblyai: { available: stt }, whisper: { available: false } },
          tts: { azure: { available: tts }, openai: { available: false }, elevenlabs: { available: false } },
        });
        setLoading(false);
        return;
      }

      try {
        const res = await fetch("/api/voice/status");
        const json = res.ok ? await res.json() : null;
        if (!cancelled) setData(json);
      } catch {
        if (!cancelled) setData(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

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
