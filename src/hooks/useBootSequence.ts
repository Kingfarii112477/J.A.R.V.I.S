"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface BootPhase {
  id: string;
  phaseNumber: number;
  title: string;
  message: string;
}

export const bootPhases: BootPhase[] = [
  { id: "power", phaseNumber: 1, title: "Power Initialization", message: "POWER SYSTEM ONLINE" },
  { id: "neural-core", phaseNumber: 2, title: "Neural Core Initialization", message: "INITIALIZING NEURAL CORE..." },
  { id: "ai-subsystems", phaseNumber: 3, title: "AI Subsystem Connection", message: "CONNECTING AI SYSTEMS..." },
  { id: "voice", phaseNumber: 4, title: "Voice System Initialization", message: "SYNCHRONIZING VOICE MODULE..." },
  { id: "memory", phaseNumber: 5, title: "Memory Subsystem Synchronization", message: "INITIALIZING MEMORY..." },
  { id: "tactical-hud", phaseNumber: 6, title: "Tactical HUD Initialization", message: "ACTIVATING TACTICAL HUD..." },
  { id: "security", phaseNumber: 7, title: "Security Layer Initialization", message: "RUNNING SYSTEM DIAGNOSTICS..." },
  { id: "activation", phaseNumber: 8, title: "J.A.R.V.I.S Activation", message: "J.A.R.V.I.S ACTIVATED" },
];

const TOTAL_DURATION_MS = 6400;

interface UseBootSequenceOptions {
  onComplete: () => void;
  onPhaseComplete?: (phase: BootPhase) => void;
}

export function useBootSequence({ onComplete, onPhaseComplete }: UseBootSequenceOptions) {
  const [progress, setProgress] = useState(0);
  const [completedCount, setCompletedCount] = useState(0);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number | null>(null);
  const doneRef = useRef(false);
  const lastCompletedRef = useRef(0);
  const onCompleteRef = useRef(onComplete);
  const onPhaseCompleteRef = useRef(onPhaseComplete);
  useEffect(() => {
    onCompleteRef.current = onComplete;
    onPhaseCompleteRef.current = onPhaseComplete;
  });

  const finish = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    setProgress(100);
    setCompletedCount(bootPhases.length);
    onCompleteRef.current();
  }, []);

  useEffect(() => {
    function tick(now: number) {
      if (startRef.current === null) startRef.current = now;
      const elapsed = now - startRef.current;
      const pct = Math.min(100, (elapsed / TOTAL_DURATION_MS) * 100);
      setProgress(pct);

      const shouldHaveCompleted = Math.floor((pct / 100) * bootPhases.length);
      if (shouldHaveCompleted > lastCompletedRef.current) {
        for (let i = lastCompletedRef.current; i < shouldHaveCompleted; i++) {
          onPhaseCompleteRef.current?.(bootPhases[i]);
        }
        lastCompletedRef.current = shouldHaveCompleted;
        setCompletedCount(shouldHaveCompleted);
      }

      if (pct >= 100) {
        finish();
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [finish]);

  return {
    progress,
    completedCount,
    phases: bootPhases,
    skip: finish,
  };
}
