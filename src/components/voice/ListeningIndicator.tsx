"use client";

import { Mic, MicOff, ShieldCheck, CloudUpload, PauseCircle } from "lucide-react";
import {
  CONVERSATION_PHASE_DETAIL,
  CONVERSATION_PHASE_LABEL,
  isAudioLeavingDevice,
  isMicrophoneActive,
  type ConversationPhase,
} from "@/lib/voice/continuous";
import { cn } from "@/lib/utils/cn";

/**
 * The always-honest microphone indicator for hands-free mode.
 *
 * Two facts are shown separately and deliberately never merged, because
 * conflating them would misrepresent the privacy posture in exactly the
 * direction that matters to a user:
 *
 *   1. Is the microphone open at all?
 *   2. Is audio leaving this device?
 *
 * During STANDBY the answer is "yes" and "no": the wake-word engine is
 * listening locally and nothing is uploaded. Showing a generic
 * "recording" dot there would imply cloud capture that isn't happening;
 * showing nothing at all would hide an open microphone. So it says
 * precisely what is true.
 */
export function ListeningIndicator({
  phase,
  className,
  detail,
}: {
  phase: ConversationPhase;
  className?: string;
  /** Overrides the stock explanation — used to surface the native
   * service's own reason for a suspended/unavailable state. */
  detail?: string | null;
}) {
  const micOpen = isMicrophoneActive(phase);
  const uploading = isAudioLeavingDevice(phase);

  const tone = uploading
    ? "border-cyan/40 bg-cyan/10 text-cyan"
    : micOpen
      ? "border-success/35 bg-success/10 text-success"
      : phase === "SUSPENDED" || phase === "OFFLINE" || phase === "UNAVAILABLE"
        ? "border-text-muted/30 bg-panel-strong/40 text-text-muted"
        : "border-violet/35 bg-violet/10 text-violet";

  const Icon = uploading ? CloudUpload : micOpen ? Mic : phase === "SUSPENDED" ? PauseCircle : MicOff;

  return (
    <div className={cn("flex items-start gap-2.5 rounded-xl border px-3 py-2", tone, className)}>
      <Icon size={15} className="mt-0.5 shrink-0" aria-hidden />
      <div className="min-w-0">
        <p className="font-technical text-[10px] tracking-[0.2em]">{CONVERSATION_PHASE_LABEL[phase]}</p>
        <p className="mt-0.5 text-[11px] leading-snug opacity-80">
          {detail ?? CONVERSATION_PHASE_DETAIL[phase]}
        </p>
        {micOpen && !uploading && (
          // The specific reassurance that makes always-on listening
          // acceptable at all — stated plainly, only when true.
          <p className="mt-1 flex items-center gap-1 text-[10px] opacity-70">
            <ShieldCheck size={11} aria-hidden />
            Processed on-device
          </p>
        )}
      </div>
    </div>
  );
}
