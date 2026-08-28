"use client";

import { useRef, useState } from "react";
import { useEventListener } from "@/hooks/useEventListener";
import type { LanguageCode, ScriptType } from "@/lib/voice/language/types";

export interface VoiceObservability {
  sessionId: string | null;
  detectedLanguage: LanguageCode | null;
  languageConfidence: number | null;
  script: ScriptType | null;
  mixedLanguage: boolean;
  sttLatencyMs: number | null;
  reasoningLatencyMs: number | null;
  ttsLatencyMs: number | null;
  roundTripLatencyMs: number | null;
  interruptionCount: number;
  fallbackCount: number;
  lastError: string | null;
}

const EMPTY: VoiceObservability = {
  sessionId: null,
  detectedLanguage: null,
  languageConfidence: null,
  script: null,
  mixedLanguage: false,
  sttLatencyMs: null,
  reasoningLatencyMs: null,
  ttsLatencyMs: null,
  roundTripLatencyMs: null,
  interruptionCount: 0,
  fallbackCount: 0,
  lastError: null,
};

/**
 * Developer-only window into voice pipeline timing and health, sourced
 * entirely from the voice.* event bus events the STT/TTS/reasoning layers
 * already emit (see hooks/useVoice.ts and hooks/useMessagePipeline.ts) —
 * no separate instrumentation path. interruptionCount/fallbackCount
 * accumulate for the lifetime of this mounted instance; every other field
 * reflects the most recent turn. Deliberately surfaces only operational
 * timing/status — never the raw transcript, the spoken response text, or
 * any provider credential.
 */
export function useVoiceObservability(): VoiceObservability {
  const [state, setState] = useState<VoiceObservability>(EMPTY);
  const turnStartedAtRef = useRef<number | null>(null);
  const ttsStartedAtRef = useRef<number | null>(null);

  useEventListener("voice.started", (payload) => {
    turnStartedAtRef.current = Date.now();
    ttsStartedAtRef.current = null;
    setState((prev) => ({
      ...prev,
      sessionId: payload.sessionId,
      sttLatencyMs: null,
      reasoningLatencyMs: null,
      ttsLatencyMs: null,
      roundTripLatencyMs: null,
      lastError: null,
    }));
  });

  useEventListener("voice.transcript", (payload) => {
    const startedAt = turnStartedAtRef.current;
    if (!payload.isFinal || startedAt === null) return;
    setState((prev) => (prev.sttLatencyMs === null ? { ...prev, sttLatencyMs: Date.now() - startedAt } : prev));
  });

  useEventListener("voice.languageDetected", (payload) => {
    setState((prev) => ({
      ...prev,
      detectedLanguage: payload.language,
      languageConfidence: payload.confidence,
      script: payload.script,
      mixedLanguage: payload.mixedLanguage,
    }));
  });

  useEventListener("voice.completed", (payload) => {
    setState((prev) => ({ ...prev, reasoningLatencyMs: payload.latencyMs }));
  });

  useEventListener("voice.speaking", () => {
    if (ttsStartedAtRef.current === null) ttsStartedAtRef.current = Date.now();
  });

  useEventListener("voice.speakingEnded", () => {
    const ttsStartedAt = ttsStartedAtRef.current;
    const turnStartedAt = turnStartedAtRef.current;
    if (ttsStartedAt === null) return;
    const now = Date.now();
    setState((prev) => ({
      ...prev,
      ttsLatencyMs: now - ttsStartedAt,
      roundTripLatencyMs: turnStartedAt !== null ? now - turnStartedAt : prev.roundTripLatencyMs,
    }));
  });

  useEventListener("voice.interrupted", () => {
    setState((prev) => ({ ...prev, interruptionCount: prev.interruptionCount + 1 }));
  });

  useEventListener("voice.providerFallback", () => {
    setState((prev) => ({ ...prev, fallbackCount: prev.fallbackCount + 1 }));
  });

  useEventListener("voice.error", (payload) => {
    setState((prev) => ({ ...prev, lastError: payload.message }));
  });

  return state;
}
