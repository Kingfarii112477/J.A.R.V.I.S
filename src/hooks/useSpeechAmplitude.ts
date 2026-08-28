"use client";

import { useEffect, useState } from "react";
import { useJarvisStore } from "@/store/jarvisStore";
import { subscribeTTSAmplitude } from "@/lib/voice/ttsAmplitude";

/**
 * Real playback amplitude (0..1) of whatever J.A.R.V.I.S is currently
 * speaking through a server-proxied TTS provider (Azure/OpenAI/
 * ElevenLabs) — drives JarvisCore's speaking-state pulse from actual
 * audio energy instead of a fixed animation. Only subscribes (and only
 * runs its rAF loop) while `active` is true, so it costs nothing outside
 * of an actual SPEAKING turn. Flat 0 when the active provider is the
 * browser SpeechSynthesis fallback, which exposes no analysable audio
 * element — JarvisCore's fixed per-state pulse takes over automatically
 * in that case.
 */
export function useSpeechAmplitude(active: boolean): number {
  const ttsProvider = useJarvisStore((s) => s.settings.ttsProvider);
  const [amplitude, setAmplitude] = useState(0);

  useEffect(() => {
    if (!active) {
      setAmplitude(0);
      return;
    }
    return subscribeTTSAmplitude(ttsProvider, setAmplitude);
  }, [active, ttsProvider]);

  return amplitude;
}
