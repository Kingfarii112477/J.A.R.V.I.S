import type { JarvisState } from "@/types/jarvis";

/**
 * The voice pipeline's own, richer state — a VIEW derived from the
 * existing shared JarvisState (see deriveVoiceState below), never a
 * second state machine driving the UI independently. useVoice.ts still
 * calls the same goListening()/goThinking()/goProcessing()/goSpeaking()/
 * goWarning()/goError()/goIdle() transitions useMessagePipeline.ts
 * already used before Phase 5 — this module only interprets that shared
 * state (plus a couple of voice-specific signals: mic-permission
 * requests, active tool calls, browser support, a momentary interrupt
 * flag) into the more legible states the Voice Command Center needs.
 */
export type VoiceState =
  | "IDLE"
  | "REQUESTING_PERMISSION"
  | "LISTENING"
  | "PROCESSING"
  | "REASONING"
  | "EXECUTING_TOOL"
  | "WAITING_CONFIRMATION"
  | "SPEAKING"
  | "INTERRUPTED"
  | "ERROR"
  | "UNAVAILABLE";

export const VOICE_STATE_LABEL: Record<VoiceState, string> = {
  IDLE: "IDLE",
  REQUESTING_PERMISSION: "REQUESTING PERMISSION",
  LISTENING: "LISTENING",
  PROCESSING: "PROCESSING",
  REASONING: "REASONING",
  EXECUTING_TOOL: "EXECUTING",
  WAITING_CONFIRMATION: "AWAITING CONFIRMATION",
  SPEAKING: "SPEAKING",
  INTERRUPTED: "INTERRUPTED",
  ERROR: "ERROR",
  UNAVAILABLE: "UNAVAILABLE",
};

export interface DeriveVoiceStateParams {
  jarvisState: JarvisState;
  supported: boolean;
  requestingPermission: boolean;
  /** True only for the brief window right after a barge-in interrupt —
   * see useVoice.ts's interrupt handling. */
  justInterrupted: boolean;
  /** From jarvisStore's activeToolCalls counter (Phase 3) — the same
   * signal JarvisCore already uses to react to concurrent tool calls,
   * reused here to tell PROCESSING (e.g. transcribing, mission
   * bookkeeping) apart from EXECUTING_TOOL. */
  activeToolCalls: number;
}

export function deriveVoiceState(params: DeriveVoiceStateParams): VoiceState {
  if (!params.supported) return "UNAVAILABLE";
  if (params.requestingPermission) return "REQUESTING_PERMISSION";
  if (params.justInterrupted) return "INTERRUPTED";

  switch (params.jarvisState) {
    case "LISTENING":
      return "LISTENING";
    case "THINKING":
      return "REASONING";
    case "PROCESSING":
      return params.activeToolCalls > 0 ? "EXECUTING_TOOL" : "PROCESSING";
    // WARNING is the existing "confirmation: orange tactical pulse"
    // state (see useMessagePipeline.ts's onNeedsConfirmation handler) —
    // reused rather than adding a parallel confirmation flag.
    case "WARNING":
      return "WAITING_CONFIRMATION";
    case "SPEAKING":
      return "SPEAKING";
    case "ERROR":
      return "ERROR";
    default:
      return "IDLE";
  }
}
