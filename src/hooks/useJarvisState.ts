import { useCallback } from "react";
import { useJarvisStore } from "@/store/jarvisStore";
import type { JarvisState } from "@/types/jarvis";

export const stateLabel: Record<JarvisState, string> = {
  BOOTING: "BOOTING",
  IDLE: "ONLINE",
  LISTENING: "LISTENING",
  THINKING: "THINKING",
  SPEAKING: "SPEAKING",
  PROCESSING: "PROCESSING",
  DIAGNOSTICS: "DIAGNOSTICS",
  WARNING: "WARNING",
  ERROR: "ERROR",
  OFFLINE: "OFFLINE",
};

export const stateDescription: Record<JarvisState, string> = {
  BOOTING: "Initializing neural systems",
  IDLE: "All systems operational",
  LISTENING: "Speak your command",
  THINKING: "Processing request",
  SPEAKING: "Delivering response",
  PROCESSING: "Executing operation",
  DIAGNOSTICS: "Running system diagnostics",
  WARNING: "Anomaly detected",
  ERROR: "Connection interrupted",
  OFFLINE: "System offline",
};

/**
 * Central control surface for the J.A.R.V.I.S state machine. Screens call
 * these instead of writing to the store directly, so every transition goes
 * through one place.
 */
export function useJarvisState() {
  const state = useJarvisStore((s) => s.state);
  const setState = useJarvisStore((s) => s.setState);
  const previousState = useJarvisStore((s) => s.previousState);

  const goIdle = useCallback(() => setState("IDLE"), [setState]);
  const goListening = useCallback(() => setState("LISTENING"), [setState]);
  const goThinking = useCallback(() => setState("THINKING"), [setState]);
  const goSpeaking = useCallback(() => setState("SPEAKING"), [setState]);
  const goProcessing = useCallback(() => setState("PROCESSING"), [setState]);
  const goDiagnostics = useCallback(() => setState("DIAGNOSTICS"), [setState]);
  const goWarning = useCallback(() => setState("WARNING"), [setState]);
  const goError = useCallback(() => setState("ERROR"), [setState]);
  const goOffline = useCallback(() => setState("OFFLINE"), [setState]);
  const restorePrevious = useCallback(
    () => setState(previousState === "BOOTING" ? "IDLE" : previousState),
    [previousState, setState]
  );

  return {
    state,
    previousState,
    label: stateLabel[state],
    description: stateDescription[state],
    setState,
    goIdle,
    goListening,
    goThinking,
    goSpeaking,
    goProcessing,
    goDiagnostics,
    goWarning,
    goError,
    goOffline,
    restorePrevious,
  };
}
