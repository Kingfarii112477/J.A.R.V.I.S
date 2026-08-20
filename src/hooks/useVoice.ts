"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useJarvisStore } from "@/store/jarvisStore";
import { useJarvisState } from "@/hooks/useJarvisState";
import { useMessagePipeline } from "@/hooks/useMessagePipeline";
import { getSTTProvider, requestMicrophonePermission } from "@/lib/voice/stt";
import { useSound } from "@/hooks/useSound";

const BAR_COUNT = 24;

export function useVoice() {
  const { state, goListening, goIdle, goError } = useJarvisState();
  const { sendMessage } = useMessagePipeline();
  const messages = useJarvisStore((s) => s.messages);
  const playSound = useSound();

  const [transcript, setTranscript] = useState("");
  const [interim, setInterim] = useState("");
  const [levels, setLevels] = useState<number[]>(() => Array(BAR_COUNT).fill(0.04));
  const [permission, setPermission] = useState<"unknown" | "granted" | "denied">("unknown");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [supported, setSupported] = useState(true);

  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const frameSkip = useRef(0);

  useEffect(() => {
    setSupported(getSTTProvider().isSupported());
  }, []);

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
      setLevels(Array.from({ length: BAR_COUNT }, (_, i) => Math.min(1, (data[i * step] ?? 0) / 200)));
    }
    rafRef.current = requestAnimationFrame(tickLevels);
  }

  const teardown = useCallback(() => {
    getSTTProvider().abort();
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    analyserRef.current = null;
    setLevels(Array(BAR_COUNT).fill(0.04));
  }, []);

  const startListening = useCallback(async () => {
    setErrorMsg(null);

    if (!getSTTProvider().isSupported()) {
      setErrorMsg("Speech recognition is not supported in this browser. Try Chrome or Edge.");
      goError();
      window.setTimeout(() => goIdle(), 1800);
      return;
    }

    const granted = await requestMicrophonePermission();
    if (!granted) {
      setPermission("denied");
      setErrorMsg("Microphone access was denied. Enable it in your browser's site settings.");
      goError();
      window.setTimeout(() => goIdle(), 1800);
      return;
    }
    setPermission("granted");

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

    getSTTProvider().start({
      onResult: ({ transcript: t, isFinal }) => {
        if (isFinal) {
          setTranscript((prev) => (prev ? `${prev} ${t}` : t).trim());
          setInterim("");
        } else {
          setInterim(t);
        }
      },
      onError: (message) => {
        setErrorMsg(message);
        teardown();
        goError();
        window.setTimeout(() => goIdle(), 1800);
      },
      onEnd: () => {
        // Recognition can end on its own after a silence timeout; leave the
        // captured transcript in place so the user can still submit it.
      },
    });
    // tickLevels is a plain hoisted function (not memoized, see comment above
    // its declaration) that only closes over stable refs and setLevels, so
    // it's intentionally left out of this dependency list — including it
    // would just make `startListening` churn identity every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goError, goIdle, goListening, playSound, teardown]);

  /** Stops capture and, if anything was transcribed, sends it through the
   * shared message pipeline (dispatcher → AI fallback → TTS). */
  const stopAndSubmit = useCallback(() => {
    const finalText = `${transcript} ${interim}`.trim();
    playSound("listen-end");
    teardown();

    if (!finalText) {
      goIdle();
      return;
    }

    const history = messages
      .slice(-10)
      .filter((m) => m.role !== "system")
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

    sendMessage(finalText, history);
    setTranscript("");
    setInterim("");
  }, [transcript, interim, messages, sendMessage, teardown, goIdle, playSound]);

  const cancel = useCallback(() => {
    teardown();
    setTranscript("");
    setInterim("");
    goIdle();
  }, [teardown, goIdle]);

  useEffect(() => teardown, [teardown]);

  return {
    state,
    transcript,
    interim,
    levels,
    permission,
    errorMsg,
    supported,
    startListening,
    stopAndSubmit,
    cancel,
  };
}
