"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useJarvisStore } from "@/store/jarvisStore";
import { useJarvisState } from "@/hooks/useJarvisState";
import { useMessagePipeline } from "@/hooks/useMessagePipeline";
import { getSTTProvider, requestMicrophonePermission } from "@/lib/voice/stt";
import { isSilentTick, shouldAutoStopForSilence } from "@/lib/voice/vad";
import { deriveVoiceState } from "@/lib/voice/state";
import { eventBus } from "@/lib/events/bus";
import { getSessionId } from "@/lib/utils/id";
import { useSound } from "@/hooks/useSound";

const BAR_COUNT = 24;
/** ~33ms per VAD tick (see vad.ts's own comment: 45 ticks ≈ 1.5s at this
 * hook's ~30 ticks/sec sampling) — used to convert the user-facing
 * settings.silenceTimeoutMs into the tick-count threshold the VAD helper
 * actually compares against. */
const MS_PER_VAD_TICK = 33;

export function useVoice() {
  const { state, goListening, goIdle, goError, goProcessing } = useJarvisState();
  const { sendMessage, stopSpeaking } = useMessagePipeline();
  const messages = useJarvisStore((s) => s.messages);
  const sttProvider = useJarvisStore((s) => s.settings.sttProvider);
  const silenceTimeoutMs = useJarvisStore((s) => s.settings.silenceTimeoutMs);
  const autoSubmitSpeech = useJarvisStore((s) => s.settings.autoSubmitSpeech);
  const voiceInterruptEnabled = useJarvisStore((s) => s.settings.voiceInterruptEnabled);
  const activeToolCalls = useJarvisStore((s) => s.activeToolCalls);
  const pushToast = useJarvisStore((s) => s.pushToast);
  const playSound = useSound();
  const sessionId = useRef(getSessionId());

  const [transcript, setTranscript] = useState("");
  const [interim, setInterim] = useState("");
  const [confidence, setConfidence] = useState<number | null>(null);
  const [levels, setLevels] = useState<number[]>(() => Array(BAR_COUNT).fill(0.04));
  const [permission, setPermission] = useState<"unknown" | "granted" | "denied">("unknown");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [supported, setSupported] = useState(true);
  const [requestingPermission, setRequestingPermission] = useState(false);
  const [justInterrupted, setJustInterrupted] = useState(false);
  const interruptTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const voiceState = useMemo(
    () => deriveVoiceState({ jarvisState: state, supported, requestingPermission, justInterrupted, activeToolCalls }),
    [state, supported, requestingPermission, justInterrupted, activeToolCalls]
  );

  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const frameSkip = useRef(0);
  const hasSpokenRef = useRef(false);
  const silentTicksRef = useRef(0);
  const stopAndSubmitRef = useRef<() => void>(() => {});
  const submitRef = useRef<(text: string) => void>(() => {});
  const activeProviderRef = useRef(getSTTProvider("browser"));
  const usedFallbackRef = useRef(false);

  useEffect(() => {
    setSupported(getSTTProvider(sttProvider).isSupported());
  }, [sttProvider]);

  // Plain hoisted function declaration (not useCallback) so the recursive
  // requestAnimationFrame(tickLevels) call below can reference it before
  // the statement finishes evaluating — a const arrow assigned via
  // useCallback can't self-reference that way.
  function tickLevels() {
    const analyser = analyserRef.current;
    if (!analyser) return;
    frameSkip.current = (frameSkip.current + 1) % 2;
    if (frameSkip.current === 0 && !document.hidden) {
      const data = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(data);
      const step = Math.max(1, Math.floor(data.length / BAR_COUNT));
      const nextLevels = Array.from({ length: BAR_COUNT }, (_, i) => Math.min(1, (data[i * step] ?? 0) / 200));
      setLevels(nextLevels);

      // Basic silence-based VAD: once actual audio energy has been seen,
      // auto-stop and submit after a sustained quiet stretch instead of
      // waiting forever for a manual tap. Driven by the raw level meter
      // (not STT results) so it works the same for the streaming browser
      // recognizer and for batch providers, which don't report anything
      // until well after the recording has already stopped. Disabled
      // entirely when settings.autoSubmitSpeech is off — the user then
      // always stops manually, however long they take.
      const silentNow = isSilentTick(nextLevels);
      if (!silentNow) hasSpokenRef.current = true;
      silentTicksRef.current = silentNow ? silentTicksRef.current + 1 : 0;
      const ticksToStop = autoSubmitSpeech ? Math.max(1, Math.round(silenceTimeoutMs / MS_PER_VAD_TICK)) : Infinity;
      if (shouldAutoStopForSilence(silentTicksRef.current, hasSpokenRef.current, ticksToStop)) {
        silentTicksRef.current = 0;
        hasSpokenRef.current = false;
        stopAndSubmitRef.current();
        return;
      }
    }
    rafRef.current = requestAnimationFrame(tickLevels);
  }

  /** Tears down only the level-meter mic/analyser — never the active STT
   * provider. Used when a batch provider (Whisper/AssemblyAI) has already
   * been gracefully `.stop()`-ed and is transcribing asynchronously: calling
   * the full `teardown()` below at that point would `.abort()` it and throw
   * the recording away before it ever reaches the server. */
  const teardownVisualization = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    analyserRef.current = null;
    hasSpokenRef.current = false;
    silentTicksRef.current = 0;
    setLevels(Array(BAR_COUNT).fill(0.04));
  }, []);

  const teardown = useCallback(() => {
    activeProviderRef.current.abort();
    teardownVisualization();
  }, [teardownVisualization]);

  const startListening = useCallback(async (providerOverride?: "browser") => {
    setErrorMsg(null);
    if (!providerOverride) usedFallbackRef.current = false;
    const provider = getSTTProvider(providerOverride ?? sttProvider);
    activeProviderRef.current = provider;

    if (!provider.isSupported()) {
      setErrorMsg("Speech recognition is not supported in this browser. Try Chrome or Edge.");
      goError();
      window.setTimeout(() => goIdle(), 1800);
      return;
    }

    // Barge-in: if J.A.R.V.I.S is mid-sentence when the user taps the mic,
    // stop it immediately rather than making them wait for the response
    // to finish — this is what makes the conversation feel real-time
    // rather than strictly turn-based. stopSpeaking() (useMessagePipeline)
    // already cancels both the active TTS provider and the browser
    // fallback and returns to IDLE; the brief justInterrupted flag exists
    // purely so the UI can show "INTERRUPTED" for a moment instead of
    // jumping straight to LISTENING with no visible acknowledgment.
    if (voiceInterruptEnabled && state === "SPEAKING") {
      stopSpeaking();
      eventBus.emit("voice.interrupted", {});
      setJustInterrupted(true);
      if (interruptTimeoutRef.current) clearTimeout(interruptTimeoutRef.current);
      interruptTimeoutRef.current = setTimeout(() => setJustInterrupted(false), 400);
    }

    setRequestingPermission(true);
    const permissionResult = await requestMicrophonePermission();
    setRequestingPermission(false);
    if (!permissionResult.granted) {
      const messages: Record<typeof permissionResult.reason, string> = {
        denied: "Microphone access was denied. Enable it in your browser's site settings.",
        unavailable: "No microphone was found on this device. Voice input is unavailable — text chat still works.",
        error: "Could not access the microphone. Voice input is temporarily unavailable.",
      };
      setPermission(permissionResult.reason === "denied" ? "denied" : "unknown");
      setErrorMsg(messages[permissionResult.reason]);
      eventBus.emit("voice.error", { sessionId: sessionId.current, message: messages[permissionResult.reason], code: permissionResult.reason });
      goError();
      window.setTimeout(() => goIdle(), 1800);
      return;
    }
    setPermission("granted");
    eventBus.emit("voice.started", { sessionId: sessionId.current });

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 64;
        analyser.smoothingTimeConstant = 0.7;
        source.connect(analyser);
        audioCtxRef.current = ctx;
        analyserRef.current = analyser;
        tickLevels();
      }
    } catch {
      // Visualization is best-effort; recognition can still work without it.
    }

    playSound("listen-start");
    goListening();
    setTranscript("");
    setInterim("");
    setConfidence(null);
    hasSpokenRef.current = false;
    silentTicksRef.current = 0;

    // Scoped to this one provider.start() call (not a ref) so it resets
    // fresh every time listening starts — tracks whether onResult/onError
    // already resolved a batch provider's one-shot result, so the onEnd
    // that always fires afterward doesn't double-transition the state.
    let batchResolved = false;

    provider.start({
      onResult: ({ transcript: t, isFinal, confidence: c }) => {
        hasSpokenRef.current = true;
        if (typeof c === "number") setConfidence(c);
        eventBus.emit("voice.transcript", { sessionId: sessionId.current, transcript: t, isFinal, confidence: c });
        if (!isFinal) {
          setInterim(t);
          return;
        }
        if (provider.id === "browser") {
          setTranscript((prev) => (prev ? `${prev} ${t}` : t).trim());
          setInterim("");
          return;
        }
        // Batch provider (Whisper/AssemblyAI): this is its one-and-only
        // final result, delivered after the user already tapped stop (see
        // stopAndSubmit below) — submit it now rather than waiting for a
        // second manual stop that will never come.
        batchResolved = true;
        setInterim("");
        teardownVisualization();
        submitRef.current(t);
      },
      onError: (message, code) => {
        batchResolved = true;
        // A configured server provider that turns out not to be set up on
        // the server falls back to the browser recognizer once, visibly —
        // never a silent swap, and never more than one retry.
        if (code === "unavailable" && !providerOverride && sttProvider !== "browser" && !usedFallbackRef.current) {
          usedFallbackRef.current = true;
          pushToast(`${message} Falling back to this browser's built-in recognizer.`, "warning");
          teardown();
          void startListening("browser");
          return;
        }
        setErrorMsg(message);
        eventBus.emit("voice.error", { sessionId: sessionId.current, message, code });
        teardown();
        goError();
        window.setTimeout(() => goIdle(), 1800);
      },
      onEnd: () => {
        // Recognition can end on its own after a silence timeout; leave the
        // captured transcript in place so the user can still submit it. A
        // batch provider that ended without ever resolving (e.g. stopped
        // almost instantly, nothing was recorded) has no such transcript to
        // preserve — return to idle instead of hanging on "LISTENING".
        if (provider.id !== "browser" && !batchResolved) {
          teardownVisualization();
          goIdle();
        }
      },
    });
    // tickLevels is a plain hoisted function (not memoized, see comment above
    // its declaration) that only closes over stable refs and setLevels, so
    // it's intentionally left out of this dependency list — including it
    // would just make `startListening` churn identity every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goError, goIdle, goListening, playSound, pushToast, sttProvider, teardown, teardownVisualization, voiceInterruptEnabled, state, stopSpeaking]);

  /** Sends transcribed text through the shared message pipeline (dispatcher
   * → AI fallback → TTS), or returns to idle if there's nothing to send.
   * Kept behind `submitRef` (synced below) so the batch-provider onResult
   * callback above — defined inside a different render's closure — always
   * calls the latest version instead of a stale one. */
  const submitTranscript = useCallback(
    (text: string) => {
      const finalText = text.trim();
      if (!finalText) {
        goIdle();
        return;
      }
      const history = messages
        .slice(-10)
        .filter((m) => m.role !== "system")
        .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
      sendMessage(finalText, history, undefined, "voice");
      setTranscript("");
      setInterim("");
    },
    [messages, sendMessage, goIdle]
  );

  /** Stops capture and, if anything was transcribed, sends it through the
   * shared message pipeline. Streaming providers (browser) already have the
   * transcript in local state by the time the user taps stop, so this sends
   * immediately; batch providers (Whisper/AssemblyAI) only produce a
   * transcript asynchronously after the upload resolves, so this instead
   * gracefully stops the recording and lets the onResult handler above
   * submit once that arrives. */
  const stopAndSubmit = useCallback(() => {
    const provider = activeProviderRef.current;
    playSound("listen-end");

    if (provider.id !== "browser") {
      teardownVisualization();
      goProcessing();
      eventBus.emit("voice.processing", { sessionId: sessionId.current });
      provider.stop();
      return;
    }

    const finalText = `${transcript} ${interim}`.trim();
    teardown();
    submitTranscript(finalText);
  }, [transcript, interim, teardown, teardownVisualization, submitTranscript, playSound, goProcessing]);

  const cancel = useCallback(() => {
    teardown();
    setTranscript("");
    setInterim("");
    goIdle();
  }, [teardown, goIdle]);

  useEffect(() => {
    stopAndSubmitRef.current = stopAndSubmit;
  }, [stopAndSubmit]);

  useEffect(() => {
    submitRef.current = submitTranscript;
  }, [submitTranscript]);

  useEffect(() => teardown, [teardown]);

  useEffect(
    () => () => {
      if (interruptTimeoutRef.current) clearTimeout(interruptTimeoutRef.current);
    },
    []
  );

  // Resume listening automatically once a spoken confirmation question
  // finishes — but only when mic permission is already granted this
  // session. Never requests a fresh permission prompt on its own; that
  // always requires an explicit user gesture (see requestMicrophonePermission
  // above, only ever called from startListening()).
  useEffect(() => {
    return eventBus.on("voice.confirmationSpoken", () => {
      if (permission === "granted") void startListening();
    });
  }, [permission, startListening]);

  return {
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
  };
}
