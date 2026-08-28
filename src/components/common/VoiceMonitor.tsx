"use client";

import { AudioWaveform } from "lucide-react";
import { useVoiceObservability } from "@/hooks/useVoiceObservability";
import { LANGUAGE_LABELS } from "@/lib/voice/language/detect";
import { cn } from "@/lib/utils/cn";

function fmtMs(ms: number | null) {
  return ms !== null ? `${ms}ms` : "…";
}

/** Developer-only overlay showing what the voice pipeline is actually
 * doing — detected language/confidence, STT/reasoning/TTS/round-trip
 * latency, interruption and provider-fallback counts — sourced purely
 * from voice.* event-bus operational metadata (see
 * useVoiceObservability.ts). Never exposes the raw transcript, the
 * spoken response text, or any provider credential. Mounted only when
 * settings.debugMode is on, same as PerfMonitor/ReasoningMonitor, so a
 * normal user pays nothing for this — not even the event subscriptions. */
export function VoiceMonitor() {
  const voice = useVoiceObservability();

  if (!voice.sessionId) {
    return (
      <div className="font-technical pointer-events-none fixed top-3 right-3 z-[55] hidden max-w-xs flex-col gap-1 rounded-xl border border-cyan/20 bg-panel-strong/90 px-3 py-2 text-[10px] tracking-[0.08em] text-text-secondary backdrop-blur-sm sm:flex">
        <div className="flex items-center gap-1.5 text-cyan">
          <AudioWaveform size={11} /> VOICE MONITOR
        </div>
        <div>No voice turn yet this session.</div>
      </div>
    );
  }

  return (
    <div className="font-technical pointer-events-none fixed top-3 right-3 z-[55] hidden max-w-xs flex-col gap-1 rounded-xl border border-cyan/20 bg-panel-strong/90 px-3 py-2 text-[10px] tracking-[0.08em] text-text-secondary backdrop-blur-sm sm:flex">
      <div className="mb-1 flex items-center gap-1.5 text-cyan">
        <AudioWaveform size={11} /> VOICE MONITOR
      </div>
      <Row
        label="LANGUAGE"
        value={voice.detectedLanguage ? `${LANGUAGE_LABELS[voice.detectedLanguage]}${voice.mixedLanguage ? " (mixed)" : ""}` : "…"}
      />
      <Row label="CONFIDENCE" value={voice.languageConfidence !== null ? `${Math.round(voice.languageConfidence * 100)}%` : "…"} />
      <Row label="STT LATENCY" value={fmtMs(voice.sttLatencyMs)} />
      <Row label="REASONING" value={fmtMs(voice.reasoningLatencyMs)} />
      <Row label="TTS LATENCY" value={fmtMs(voice.ttsLatencyMs)} />
      <Row label="ROUND TRIP" value={fmtMs(voice.roundTripLatencyMs)} />
      <Row label="INTERRUPTIONS" value={String(voice.interruptionCount)} />
      <Row
        label="FALLBACKS"
        value={String(voice.fallbackCount)}
        valueClassName={voice.fallbackCount > 0 ? "text-warning" : undefined}
      />
      {voice.lastError && <Row label="LAST ERROR" value={voice.lastError} valueClassName="text-danger" />}
    </div>
  );
}

function Row({ label, value, valueClassName }: { label: string; value: string; valueClassName?: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span>{label}</span>
      <span className={cn("truncate text-text-primary", valueClassName)}>{value}</span>
    </div>
  );
}
