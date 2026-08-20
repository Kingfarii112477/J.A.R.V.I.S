"use client";

import { useEffect, useRef } from "react";
import { useJarvisStore } from "@/store/jarvisStore";
import { TelemetryEngine } from "@/lib/telemetry/engine";

const STORE_UPDATE_INTERVAL_MS = 180;

/**
 * Drives the simulated live telemetry loop. Mounted once near the app root
 * (see JarvisShell) so every screen reads from the same smoothed values via
 * the store instead of running its own simulation.
 */
export function useTelemetryEngine() {
  const engineRef = useRef<TelemetryEngine | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastFrameRef = useRef<number>(0);
  const lastStoreWriteRef = useRef<number>(0);

  useEffect(() => {
    const initial = useJarvisStore.getState().telemetry;
    engineRef.current = new TelemetryEngine(initial);
    lastFrameRef.current = performance.now();

    function loop(now: number) {
      const engine = engineRef.current;
      if (!engine) return;

      const delta = Math.min(now - lastFrameRef.current, 200);
      lastFrameRef.current = now;

      if (!document.hidden) {
        const state = useJarvisStore.getState().state;
        const next = engine.tick(delta, state);

        if (now - lastStoreWriteRef.current >= STORE_UPDATE_INTERVAL_MS) {
          lastStoreWriteRef.current = now;
          useJarvisStore.getState().setTelemetry(next);
        }
      }

      rafRef.current = requestAnimationFrame(loop);
    }

    rafRef.current = requestAnimationFrame(loop);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);
}

export function useTelemetry() {
  return useJarvisStore((s) => s.telemetry);
}
