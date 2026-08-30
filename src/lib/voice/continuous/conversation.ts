import type { JarvisState } from "@/types/jarvis";
import type { ListeningSnapshot } from "./types";

/**
 * The hands-free conversation's observable phase.
 *
 * Like lib/voice/state.ts's VoiceState, this is a derived VIEW — not a
 * third state machine. It reads the existing shared JarvisState (the one
 * useMessagePipeline has driven since Phase 1) plus two signals that
 * genuinely aren't in it: what the native listening service is doing,
 * and whether a follow-up window is currently open. Everything else is
 * interpretation.
 *
 * Why a separate view from VoiceState at all: VoiceState answers "what
 * is the voice UI doing right now", which is a tap-to-talk question.
 * ConversationPhase answers "where are we in a hands-free exchange",
 * which additionally has to express STANDBY (nothing happening, but the
 * mic is armed) and FOLLOW_UP (nothing happening, but we're still
 * listening for a continuation). Collapsing those into VoiceState's IDLE
 * would lose exactly the distinction the UI needs to show.
 */
export type ConversationPhase =
  | "OFFLINE"
  | "UNAVAILABLE"
  | "SUSPENDED"
  | "STANDBY"
  | "WAKE_DETECTED"
  | "LISTENING"
  | "THINKING"
  | "EXECUTING"
  | "SPEAKING"
  | "FOLLOW_UP"
  | "ERROR";

export const CONVERSATION_PHASE_LABEL: Record<ConversationPhase, string> = {
  OFFLINE: "OFFLINE",
  UNAVAILABLE: "UNAVAILABLE",
  SUSPENDED: "PAUSED",
  STANDBY: "STANDBY",
  WAKE_DETECTED: "WAKE DETECTED",
  LISTENING: "LISTENING",
  THINKING: "THINKING",
  EXECUTING: "EXECUTING",
  SPEAKING: "SPEAKING",
  FOLLOW_UP: "AWAITING FOLLOW-UP",
  ERROR: "ERROR",
};

/** One-line explanation shown under the phase — always describes what is
 * actually true, including for the states where we are NOT listening. */
export const CONVERSATION_PHASE_DETAIL: Record<ConversationPhase, string> = {
  OFFLINE: "No network — voice commands need a connection.",
  UNAVAILABLE: "Hands-free listening isn't available on this device.",
  SUSPENDED: "Standby listening is paused.",
  STANDBY: 'Listening for "Jarvis" on this device only.',
  WAKE_DETECTED: "Wake word heard.",
  LISTENING: "Listening to your command.",
  THINKING: "Working on it.",
  EXECUTING: "Running the requested action.",
  SPEAKING: "Responding.",
  FOLLOW_UP: "Still listening — no need to say the wake word.",
  ERROR: "Something went wrong with the last turn.",
};

export interface DeriveConversationPhaseParams {
  /** The existing shared state machine — the same value the 3D core,
   * status pill, and VoiceState already read. */
  jarvisState: JarvisState;
  /** Latest snapshot from the native service, or null when continuous
   * listening isn't running at all. */
  listening: ListeningSnapshot | null;
  /** True while the post-response window for a natural continuation is
   * open (see useContinuousListening.ts). */
  followUpOpen: boolean;
  /** From jarvisStore's activeToolCalls — distinguishes EXECUTING (a
   * real tool is running) from THINKING, reusing the Phase 3 signal
   * rather than inventing a parallel flag. */
  activeToolCalls: number;
  /** Real connectivity, from the Phase 6 system-status wiring. */
  online: boolean;
  /** True for the brief window right after the wake word fires, before
   * capture actually begins. */
  justWoke: boolean;
}

export function deriveConversationPhase(params: DeriveConversationPhaseParams): ConversationPhase {
  const { jarvisState, listening, followUpOpen, activeToolCalls, online, justWoke } = params;

  // An active turn always outranks connectivity: if reasoning or speech
  // is genuinely in flight we show that, because a stale "OFFLINE" over
  // a working response would be its own kind of lie.
  const midTurn =
    jarvisState === "LISTENING" ||
    jarvisState === "THINKING" ||
    jarvisState === "PROCESSING" ||
    jarvisState === "SPEAKING";

  if (!online && !midTurn) return "OFFLINE";

  switch (jarvisState) {
    case "LISTENING":
      return "LISTENING";
    case "THINKING":
      return "THINKING";
    case "PROCESSING":
      return activeToolCalls > 0 ? "EXECUTING" : "THINKING";
    case "SPEAKING":
      return "SPEAKING";
    case "ERROR":
      return "ERROR";
    default:
      break;
  }

  if (justWoke) return "WAKE_DETECTED";
  // The follow-up window is only meaningful while the native mic is
  // handed to us; if the service says otherwise, trust the service.
  if (followUpOpen) return "FOLLOW_UP";

  if (!listening) return "UNAVAILABLE";
  switch (listening.state) {
    case "STANDBY":
      return "STANDBY";
    case "HANDED_OFF":
      // Mic released to the web layer but no turn has started yet.
      return "WAKE_DETECTED";
    case "SUSPENDED":
      return "SUSPENDED";
    case "UNAVAILABLE":
      return "UNAVAILABLE";
    default:
      return "UNAVAILABLE";
  }
}

/** Phases during which the microphone is genuinely open. Drives the
 * privacy indicator — it must be true exactly when we are recording,
 * never approximated. */
export function isMicrophoneActive(phase: ConversationPhase): boolean {
  return phase === "LISTENING" || phase === "FOLLOW_UP" || phase === "STANDBY";
}

/** Whether audio is being sent off-device in this phase. STANDBY is
 * deliberately false: wake-word detection is entirely local, and
 * conflating it with cloud capture would misrepresent the privacy
 * posture in exactly the direction that matters. */
export function isAudioLeavingDevice(phase: ConversationPhase): boolean {
  return phase === "LISTENING" || phase === "FOLLOW_UP";
}
