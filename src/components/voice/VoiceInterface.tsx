"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { motion } from "framer-motion";
import { Mic, MicOff, AlertTriangle, MessageSquare, Square, X, Volume2, VolumeX, ExternalLink } from "lucide-react";
import { JarvisCore } from "@/components/3d/JarvisCore";
import { HudPanel } from "@/components/hud/HudPanel";
import { VoiceVisualizer } from "./VoiceVisualizer";
import { useVoice } from "@/hooks/useVoice";
import { useVoiceProviderStatus, type VoiceProviderStatus } from "@/hooks/useVoiceProviderStatus";
import { useEventListener } from "@/hooks/useEventListener";
import { useJarvisStore } from "@/store/jarvisStore";
import { stateLabel, stateDescription } from "@/hooks/useJarvisState";
import { VOICE_STATE_LABEL } from "@/lib/voice/state";
import { LANGUAGE_LABELS } from "@/lib/voice/language/detect";
import type { LanguageCode } from "@/lib/voice/language/types";
import { textColor } from "@/components/common/StatusIndicator";
import { cn } from "@/lib/utils/cn";
import { isStandalone } from "@/lib/runtime/standalone";
import { getDeviceCapabilityProvider } from "@/lib/device/manager";

const PROVIDER_STATUS_LABEL: Record<VoiceProviderStatus, string> = { REAL: "CONNECTED", FALLBACK: "FALLBACK", UNAVAILABLE: "UNAVAILABLE" };
const PROVIDER_STATUS_COLOR: Record<VoiceProviderStatus, string> = { REAL: "text-success", FALLBACK: "text-warning", UNAVAILABLE: "text-danger" };

/**
 * The Voice Command Center — Phase 5's upgrade of the Phase 2 voice
 * screen. Same file/component (app/voice/page.tsx renders this
 * unchanged) rather than a rename, since nothing about its role in the
 * app changed, only its capability. Every new element here (language
 * indicator, connection status, mute/cancel controls) reads from real
 * state — settings, the event bus, and GET /api/voice/status — never a
 * cosmetic placeholder.
 */
export function VoiceInterface() {
  const router = useRouter();
  const {
    state,
    voiceState,
    transcript,
    interim,
    confidence,
    levels,
    permission,
    requestingPermission,
    errorMsg,
    supported,
    startListening,
    stopAndSubmit,
    cancel,
    stopSpeaking,
  } = useVoice();
  const quality = useJarvisStore((s) => s.settings.graphicsQuality);
  const voiceEnabled = useJarvisStore((s) => s.settings.voiceEnabled);
  const updateSettings = useJarvisStore((s) => s.updateSettings);
  const messages = useJarvisStore((s) => s.messages);
  const { sttStatus, ttsStatus } = useVoiceProviderStatus();

  const [detectedLanguage, setDetectedLanguage] = useState<{ language: LanguageCode; confidence: number } | null>(null);
  useEventListener("voice.languageDetected", (p) => setDetectedLanguage({ language: p.language, confidence: p.confidence }));

  const listening = state === "LISTENING";
  const busy = state === "THINKING" || state === "PROCESSING" || state === "SPEAKING";
  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant" && m.status !== "streaming");

  function handleTap() {
    if (listening) {
      stopAndSubmit();
    } else if (state === "SPEAKING") {
      stopSpeaking();
    } else if (!busy) {
      startListening();
    } else {
      cancel();
    }
  }

  const avg = levels.reduce((s, v) => s + v, 0) / levels.length;
  const voiceLevelLabel = !listening ? "—" : avg > 0.45 ? "OPTIMAL" : avg > 0.12 ? "LOW SIGNAL" : "SILENT";

  return (
    <div className="flex flex-col items-center gap-4">
      {!voiceEnabled && (
        <HudPanel className="flex w-full items-center gap-2 border-warning/30 text-warning">
          <AlertTriangle size={16} />
          <span className="font-technical text-xs tracking-[0.05em]">
            Voice is disabled in Settings → Voice. Enable it to use this screen.
          </span>
        </HudPanel>
      )}

      {!supported && (
        <HudPanel className="flex w-full items-center gap-2 border-danger/30 text-danger">
          <AlertTriangle size={16} />
          <span className="font-technical text-xs tracking-[0.05em]">
            Speech recognition isn&apos;t supported in this browser. Try Chrome, Edge, or Safari.
          </span>
        </HudPanel>
      )}

      {errorMsg && (
        <HudPanel className="flex w-full items-center gap-2 border-danger/30 text-danger">
          <AlertTriangle size={16} />
          <span className="font-technical text-xs tracking-[0.05em]">{errorMsg}</span>
        </HudPanel>
      )}

      <HudPanel className="scanline-sweep relative flex w-full flex-col items-center overflow-hidden py-4">
        <div className="flex w-full items-center justify-between px-2">
          <span className="font-technical text-[10px] tracking-[0.15em] text-cyan">J.A.R.V.I.S VOICE CORE</span>
          <button
            type="button"
            onClick={() => updateSettings({ voiceEnabled: !voiceEnabled })}
            aria-label={voiceEnabled ? "Mute voice" : "Unmute voice"}
            className="flex items-center gap-1 rounded-full border border-cyan/20 px-2 py-1 text-text-muted hover:border-cyan/40 hover:text-cyan"
          >
            {voiceEnabled ? <Volume2 size={12} /> : <VolumeX size={12} />}
            <span className="font-technical text-[9px] tracking-[0.08em]">{voiceEnabled ? "VOICE ON" : "MUTED"}</span>
          </button>
        </div>

        <div
          className="relative mt-2 h-[280px] w-[280px] cursor-pointer sm:h-[320px] sm:w-[320px] lg:h-[400px] lg:w-[400px]"
          onClick={handleTap}
          role="button"
          tabIndex={0}
          aria-label={listening ? "Stop listening and send" : "Start listening"}
          onKeyDown={(e) => e.key === "Enter" && handleTap()}
        >
          <JarvisCore state={state} quality={quality} className="h-full w-full" />
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <motion.div
              animate={{ scale: listening ? [1, 1.08, 1] : 1 }}
              transition={{ repeat: listening ? Infinity : 0, duration: 1.4 }}
              className={cn(
                "flex h-16 w-16 items-center justify-center rounded-full border-2",
                listening ? "border-cyan text-cyan" : "border-white/50 text-white/80"
              )}
            >
              {listening ? <Mic size={26} /> : <MicOff size={24} />}
            </motion.div>
          </div>
        </div>

        <VoiceVisualizer levels={levels} active={listening} />

        <p className={cn("font-display mt-1 text-2xl tracking-[0.2em]", textColor[state])}>{stateLabel[state]}</p>
        <p className="font-technical mt-1 text-xs tracking-[0.1em] text-text-secondary">
          {requestingPermission ? "Requesting microphone access…" : stateDescription[state]}
        </p>
        <p className="font-technical mt-0.5 text-[9px] tracking-[0.15em] text-text-muted">{VOICE_STATE_LABEL[voiceState]}</p>

        {(transcript || interim) && (
          <div className="mt-4 w-full max-w-md rounded-xl border border-cyan/15 bg-panel-strong px-4 py-3 text-center">
            <p className="text-sm text-text-primary">
              {transcript}
              <span className="text-text-muted">{interim ? ` ${interim}` : ""}</span>
            </p>
            <div className="mt-1.5 flex items-center justify-center gap-3">
              {confidence !== null && !listening && (
                <p className="font-technical text-[10px] tracking-[0.1em] text-text-muted">CONFIDENCE: {Math.round(confidence * 100)}%</p>
              )}
              {detectedLanguage && (
                <p className="font-technical flex items-center gap-1 text-[10px] tracking-[0.1em] text-cyan">
                  <span>{LANGUAGE_LABELS[detectedLanguage.language]}</span>
                  <span className="text-text-muted">{Math.round(detectedLanguage.confidence * 100)}%</span>
                </p>
              )}
            </div>
          </div>
        )}

        <div className="mt-4 flex items-center gap-2">
          {state === "SPEAKING" && (
            <button
              type="button"
              onClick={stopSpeaking}
              className="font-technical flex items-center gap-1.5 rounded-full border border-warning/30 px-3 py-1.5 text-[10px] tracking-[0.1em] text-warning hover:bg-warning/10"
            >
              <Square size={11} /> STOP SPEAKING
            </button>
          )}
          {(listening || busy) && state !== "SPEAKING" && (
            <button
              type="button"
              onClick={cancel}
              className="font-technical flex items-center gap-1.5 rounded-full border border-danger/30 px-3 py-1.5 text-[10px] tracking-[0.1em] text-danger hover:bg-danger/10"
            >
              <X size={11} /> CANCEL
            </button>
          )}
        </div>

        {!listening && !busy && lastAssistant && (
          <button
            type="button"
            onClick={() => router.push("/chat")}
            className="font-technical mt-4 flex items-center gap-1.5 text-[10px] tracking-[0.1em] text-cyan hover:text-cyan-soft"
          >
            <MessageSquare size={12} /> VIEW FULL RESPONSE IN CHAT
          </button>
        )}
      </HudPanel>

      <div className="grid w-full grid-cols-3 gap-3">
        <HudPanel className="flex flex-col items-center gap-1 py-4 text-center">
          <span className="font-technical text-[10px] tracking-[0.15em] text-text-secondary">VOICE MODE</span>
          <span className={cn("font-technical mt-1 text-xs tracking-[0.1em]", voiceEnabled ? "text-success" : "text-text-muted")}>
            {voiceEnabled ? "ACTIVE" : "DISABLED"}
          </span>
        </HudPanel>
        <HudPanel className="flex flex-col items-center gap-1 py-4 text-center">
          <span className="font-technical text-[10px] tracking-[0.15em] text-text-secondary">NOISE FILTER</span>
          <span className="font-technical mt-1 text-xs tracking-[0.1em] text-success">ON</span>
        </HudPanel>
        <HudPanel className="flex flex-col items-center gap-1 py-4 text-center">
          <span className="font-technical text-[10px] tracking-[0.15em] text-text-secondary">VOICE LEVEL</span>
          <span className="font-technical mt-1 text-xs tracking-[0.1em] text-cyan">{voiceLevelLabel}</span>
        </HudPanel>
      </div>

      <div className="grid w-full grid-cols-3 gap-3">
        <HudPanel className="flex flex-col items-center gap-1 py-4 text-center">
          <span className="font-technical text-[10px] tracking-[0.15em] text-text-secondary">MICROPHONE</span>
          <span
            className={cn(
              "font-technical mt-1 text-xs tracking-[0.1em]",
              permission === "granted" ? "text-success" : permission === "denied" ? "text-danger" : "text-text-muted"
            )}
          >
            {permission === "granted" ? "GRANTED" : permission === "denied" ? "DENIED" : "NOT REQUESTED"}
          </span>
          {permission === "denied" && isStandalone() && (
            // Retrying is pointless once Android has stopped prompting, so
            // this offers the only action that can actually change the
            // outcome rather than an error the user can't act on.
            <button
              type="button"
              onClick={() => void getDeviceCapabilityProvider().openAppSettings()}
              className="font-technical mt-1.5 inline-flex items-center gap-1 rounded-lg border border-danger/40 px-2 py-1 text-[9px] tracking-[0.1em] text-danger transition-colors hover:border-danger"
            >
              <ExternalLink size={10} aria-hidden />
              APP SETTINGS
            </button>
          )}
        </HudPanel>
        <HudPanel className="flex flex-col items-center gap-1 py-4 text-center">
          <span className="font-technical text-[10px] tracking-[0.15em] text-text-secondary">STT PROVIDER</span>
          <span className={cn("font-technical mt-1 text-xs tracking-[0.1em]", PROVIDER_STATUS_COLOR[sttStatus])}>{PROVIDER_STATUS_LABEL[sttStatus]}</span>
        </HudPanel>
        <HudPanel className="flex flex-col items-center gap-1 py-4 text-center">
          <span className="font-technical text-[10px] tracking-[0.15em] text-text-secondary">TTS PROVIDER</span>
          <span className={cn("font-technical mt-1 text-xs tracking-[0.1em]", PROVIDER_STATUS_COLOR[ttsStatus])}>{PROVIDER_STATUS_LABEL[ttsStatus]}</span>
        </HudPanel>
      </div>
    </div>
  );
}
