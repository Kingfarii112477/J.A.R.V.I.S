"use client";

import { cn } from "@/lib/utils/cn";
import {
  CONVERSATION_PHASE_DETAIL,
  isAudioLeavingDevice,
  isMicrophoneActive,
  type ConversationPhase,
} from "@/lib/voice/continuous";

/**
 * The compact "J.A.R.V.I.S / VOICE CORE" readout.
 *
 * Deliberately states the phase in the app's own vocabulary rather than
 * a generic recording dot, and — like ListeningIndicator — never lets
 * "the microphone is open" imply "audio is being uploaded". STANDBY is
 * the case that matters: the mic is genuinely live, and nothing leaves
 * the device.
 */

/** Short status word shown on the third line. */
const CORE_STATE: Record<ConversationPhase, string> = {
  OFFLINE: "OFFLINE",
  UNAVAILABLE: "OFF",
  SUSPENDED: "PAUSED",
  STANDBY: "LISTENING",
  WAKE_DETECTED: "ACTIVE",
  LISTENING: "ACTIVE",
  THINKING: "THINKING",
  EXECUTING: "WORKING",
  SPEAKING: "SPEAKING",
  FOLLOW_UP: "ACTIVE",
  ERROR: "ERROR",
};

const CORE_TONE: Record<ConversationPhase, string> = {
  OFFLINE: "text-text-muted",
  UNAVAILABLE: "text-text-muted",
  SUSPENDED: "text-text-muted",
  STANDBY: "text-success",
  WAKE_DETECTED: "text-warning",
  LISTENING: "text-danger",
  THINKING: "text-violet",
  EXECUTING: "text-violet",
  SPEAKING: "text-cyan",
  FOLLOW_UP: "text-danger",
  ERROR: "text-danger",
};

export function VoiceCoreStatus({
  phase,
  className,
  detail,
}: {
  phase: ConversationPhase;
  className?: string;
  detail?: string | null;
}) {
  const micOpen = isMicrophoneActive(phase);
  const uploading = isAudioLeavingDevice(phase);
  const tone = CORE_TONE[phase];
  // Pulse only while genuinely capturing — a pulsing dot during STANDBY
  // would read as "recording you right now", which isn't what's
  // happening.
  const pulsing = phase === "LISTENING" || phase === "FOLLOW_UP" || phase === "WAKE_DETECTED";

  return (
    <div
      className={cn("hud-panel rounded-xl px-3.5 py-2.5", className)}
      role="status"
      aria-live="polite"
      aria-label={`Voice core: ${CORE_STATE[phase]}. ${detail ?? CONVERSATION_PHASE_DETAIL[phase]}`}
    >
      <p className="font-display text-[11px] tracking-[0.3em] text-text-primary">J.A.R.V.I.S</p>
      <p className="font-technical text-[9px] tracking-[0.25em] text-text-muted">VOICE CORE</p>
      <div className="mt-1.5 flex items-center gap-2">
        <span className="relative flex h-2 w-2">
          {pulsing && (
            <span className={cn("absolute inline-flex h-full w-full animate-ping rounded-full opacity-60", tone.replace("text-", "bg-"))} />
          )}
          <span className={cn("relative inline-flex h-2 w-2 rounded-full", tone.replace("text-", "bg-"))} />
        </span>
        <span className={cn("font-technical text-[10px] tracking-[0.2em]", tone)}>{CORE_STATE[phase]}</span>
      </div>
      {micOpen && !uploading && (
        <p className="mt-1 text-[9px] leading-tight text-text-muted">On-device only</p>
      )}
      {detail && <p className="mt-1 text-[9px] leading-tight text-text-muted">{detail}</p>}
    </div>
  );
}
