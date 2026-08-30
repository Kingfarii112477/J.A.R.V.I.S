"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useJarvisStore } from "@/store/jarvisStore";
import { getContinuousListeningProvider } from "@/lib/voice/continuous";
import type { ListeningSnapshot } from "@/lib/voice/continuous";
import { eventBus } from "@/lib/events/bus";
import { logAuditEvent } from "@/lib/security/auditLog";

/** Spoken the moment the wake phrase is heard, before capture starts —
 * short on purpose so the user can begin talking almost immediately, and
 * interruptible like any other utterance (the existing barge-in path
 * cancels it if they start early). */
const ACKNOWLEDGEMENT = "Yes, Sir?";

export interface UseContinuousListeningParams {
  /** The EXISTING capture entry point from useVoice — deliberately the
   * same function a manual mic tap calls, so a hands-free turn and a
   * tapped turn run byte-for-byte the same STT → language detection →
   * ReasoningEngine → tools → TTS pipeline. There is no second path. */
  startListening: () => void;
  /** The existing TTS entry point (Azure/OpenAI/ElevenLabs/browser via
   * the Phase 5 provider chain) — reused for the acknowledgement rather
   * than adding a second speech route. */
  speak: (text: string, onEnd?: () => void) => void;
  /** Whether a turn is currently in flight, so the follow-up window
   * doesn't open on top of one. */
  busy: boolean;
  sessionId: string;
}

export interface ContinuousListeningStatus {
  /** Latest native snapshot, or null when continuous listening isn't
   * running (browser, disabled, or never started). */
  snapshot: ListeningSnapshot | null;
  /** True for the brief window between the wake word firing and capture
   * actually beginning. */
  justWoke: boolean;
  /** True while a natural continuation is being accepted without the
   * wake word. */
  followUpOpen: boolean;
  /** Honest availability, checked against the native build. */
  available: boolean;
  unavailableReason: string | null;
}

/**
 * Bridges the native always-on listening service to the app's existing
 * voice pipeline.
 *
 * This hook is deliberately thin. It decides WHEN to start capturing and
 * WHEN to hand the microphone back; it does not transcribe, reason,
 * execute tools, or speak. All of that is the existing pipeline's job,
 * reached through the two callbacks above. That is what keeps the
 * promise of a single brain: hands-free is a new way to *trigger* the
 * pipeline, not a parallel implementation of it.
 *
 * Turn shape:
 *   STANDBY (native, on-device, no audio leaves the phone)
 *     → wake word heard
 *     → "Yes, Sir?" (interruptible)
 *     → startListening()  [existing pipeline takes over completely]
 *     → response finishes
 *     → follow-up window (speak again with no wake word)
 *     → window closes → resumeStandby() → STANDBY
 */
export function useContinuousListening(params: UseContinuousListeningParams): ContinuousListeningStatus {
  const { startListening, speak, busy, sessionId } = params;

  const continuousListening = useJarvisStore((s) => s.settings.continuousListening);
  const followUpListening = useJarvisStore((s) => s.settings.followUpListening);
  const followUpTimeoutMs = useJarvisStore((s) => s.settings.followUpTimeoutMs);
  const batterySaver = useJarvisStore((s) => s.settings.voiceBatterySaver);
  const sensitivity = useJarvisStore((s) => s.settings.wakeWordSensitivity);
  const voiceEnabled = useJarvisStore((s) => s.settings.voiceEnabled);
  const networkOnline = useJarvisStore((s) => s.networkOnline);
  const pushToast = useJarvisStore((s) => s.pushToast);

  const [snapshot, setSnapshot] = useState<ListeningSnapshot | null>(null);
  const [justWoke, setJustWoke] = useState(false);
  const [followUpOpen, setFollowUpOpen] = useState(false);
  const [available, setAvailable] = useState(false);
  const [unavailableReason, setUnavailableReason] = useState<string | null>(null);

  const followUpTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wokeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const followUpUsedRef = useRef(false);
  // Latest values for callbacks that are registered once but must always
  // act on current state — avoids re-subscribing the native listener on
  // every settings change.
  const latest = useRef({ startListening, speak, busy, networkOnline, sessionId });
  useEffect(() => {
    latest.current = { startListening, speak, busy, networkOnline, sessionId };
  });

  const clearFollowUp = useCallback((used: boolean) => {
    if (followUpTimerRef.current) {
      clearTimeout(followUpTimerRef.current);
      followUpTimerRef.current = null;
    }
    setFollowUpOpen((wasOpen) => {
      if (wasOpen) {
        eventBus.emit("voice.followUpClosed", { sessionId: latest.current.sessionId, used });
      }
      return false;
    });
  }, []);

  /** Hands the microphone back to the native wake-word engine. Called
   * once a turn (and any follow-up window) is genuinely finished. */
  const returnToStandby = useCallback(() => {
    void getContinuousListeningProvider().resumeStandby();
  }, []);

  // ---- Availability probe -------------------------------------------------

  useEffect(() => {
    let cancelled = false;
    void getContinuousListeningProvider()
      .checkAvailability()
      .then((result) => {
        if (cancelled) return;
        setAvailable(result.available);
        setUnavailableReason(result.reason);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // ---- Native event subscription ------------------------------------------

  useEffect(() => {
    const provider = getContinuousListeningProvider();

    const unsubscribe = provider.subscribe({
      onWakeWord: () => {
        // Audit the detection itself — never the audio, never a
        // transcript. This is the privacy-relevant fact: the microphone
        // moved from local-only standby into real capture.
        logAuditEvent({
          type: "VOICE_LISTENING",
          source: "wake-word",
          result: "success",
          detail: "wake_word.detected",
        });
        eventBus.emit("voice.wakeWordDetected", { sessionId: latest.current.sessionId });

        if (!latest.current.networkOnline) {
          // Wake word works offline (it's local); the command pipeline
          // does not. Say so rather than opening a mic that can't lead
          // anywhere, and re-arm standby.
          latest.current.speak("Sir, I'm currently offline.", () => returnToStandby());
          return;
        }

        setJustWoke(true);
        if (wokeTimerRef.current) clearTimeout(wokeTimerRef.current);

        // Acknowledge, then start the EXISTING capture flow. Starting
        // capture in the onEnd callback avoids the acknowledgement being
        // recorded as part of the user's command.
        latest.current.speak(ACKNOWLEDGEMENT, () => {
          setJustWoke(false);
          eventBus.emit("voice.activeListeningStarted", {
            sessionId: latest.current.sessionId,
            trigger: "wake-word",
          });
          logAuditEvent({
            type: "VOICE_LISTENING",
            source: "wake-word",
            result: "success",
            detail: "active_listening.started",
          });
          latest.current.startListening();
        });

        // Safety net: if TTS never fires onEnd (provider failure, muted
        // output), don't strand the user in a woken-but-not-listening
        // state — start capture anyway.
        wokeTimerRef.current = setTimeout(() => {
          if (!latest.current.busy) latest.current.startListening();
          setJustWoke(false);
        }, 4000);
      },

      onStateChange: (next) => setSnapshot(next),

      onError: (message) => {
        pushToast(message, "warning", "Continuous listening");
      },
    });

    return () => {
      unsubscribe();
      if (wokeTimerRef.current) clearTimeout(wokeTimerRef.current);
    };
  }, [pushToast, returnToStandby]);

  // ---- Start/stop the native service from settings ------------------------

  useEffect(() => {
    const provider = getContinuousListeningProvider();
    const shouldRun = continuousListening && voiceEnabled;

    if (!shouldRun) {
      void provider.stop().then(() => {
        eventBus.emit("voice.standbyStopped", { reason: voiceEnabled ? "disabled" : "voice-off" });
      });
      setSnapshot(null);
      return;
    }

    let cancelled = false;
    void provider.start({ sensitivity, batterySaver }).then((result) => {
      if (cancelled) return;
      if (result.started) {
        eventBus.emit("voice.standbyStarted", { source: "native" });
        logAuditEvent({
          type: "VOICE_LISTENING",
          source: "continuous",
          result: "success",
          detail: "standby.started",
        });
      } else if (result.reason) {
        // Never silently fail into a state where the UI implies
        // listening — say why it didn't start.
        pushToast(result.reason, "warning", "Continuous listening");
      }
    });

    return () => {
      cancelled = true;
    };
  }, [continuousListening, voiceEnabled, sensitivity, batterySaver, pushToast]);

  // ---- Resync after a WebView/Activity recreation --------------------------

  useEffect(() => {
    if (!continuousListening) return;
    // The native service keeps running across WebView recreation, so the
    // web layer's state can be stale by exactly one lifecycle. Pull the
    // authoritative snapshot rather than assuming.
    void getContinuousListeningProvider().getState().then(setSnapshot);
  }, [continuousListening]);

  // ---- Follow-up window ---------------------------------------------------

  useEffect(() => {
    // A completed turn is the trigger for the natural-continuation
    // window. voice.speakingEnded is the existing Phase 5 event that
    // fires when TTS playback for a turn genuinely finishes.
    return eventBus.on("voice.speakingEnded", () => {
      if (!continuousListening || !available) return;

      if (!followUpListening) {
        returnToStandby();
        return;
      }

      followUpUsedRef.current = false;
      setFollowUpOpen(true);
      eventBus.emit("voice.followUpOpened", {
        sessionId: latest.current.sessionId,
        timeoutMs: followUpTimeoutMs,
      });

      // Keep the mic with the web layer and listen again immediately —
      // this is what lets "now only show the newest ones" work without
      // repeating the wake word.
      eventBus.emit("voice.activeListeningStarted", {
        sessionId: latest.current.sessionId,
        trigger: "follow-up",
      });
      latest.current.startListening();

      if (followUpTimerRef.current) clearTimeout(followUpTimerRef.current);
      followUpTimerRef.current = setTimeout(() => {
        clearFollowUp(followUpUsedRef.current);
        logAuditEvent({
          type: "VOICE_LISTENING",
          source: "follow-up",
          result: "success",
          detail: "active_listening.ended",
        });
        returnToStandby();
      }, followUpTimeoutMs);
    });
  }, [continuousListening, available, followUpListening, followUpTimeoutMs, clearFollowUp, returnToStandby]);

  /** A real command during the follow-up window closes it — the turn
   * takes over and a fresh window opens when that turn finishes. */
  useEffect(() => {
    return eventBus.on("voice.transcript", ({ isFinal, transcript }) => {
      if (isFinal && transcript.trim() && followUpOpen) {
        followUpUsedRef.current = true;
        clearFollowUp(true);
      }
    });
  }, [followUpOpen, clearFollowUp]);

  useEffect(() => {
    return eventBus.on("voice.completed", () => {
      logAuditEvent({
        type: "VOICE_LISTENING",
        source: "continuous",
        result: "success",
        detail: "voice_command.processed",
      });
    });
  }, []);

  // Clean up timers on unmount so a backgrounded app can't fire a
  // follow-up into a torn-down pipeline.
  useEffect(
    () => () => {
      if (followUpTimerRef.current) clearTimeout(followUpTimerRef.current);
      if (wokeTimerRef.current) clearTimeout(wokeTimerRef.current);
    },
    []
  );

  return { snapshot, justWoke, followUpOpen, available, unavailableReason };
}
