"use client";

import { useEffect, useRef, useState } from "react";
import { useEventListener } from "@/hooks/useEventListener";

export interface PerfStats {
  fps: number;
  usedJsHeapMB: number | null;
  lastAiLatencyMs: number | null;
  lastToolLatencyMs: number | null;
}

interface PerformanceMemory {
  usedJSHeapSize: number;
}

/** Lightweight, dev-only performance sampler. Not mounted/rendered unless
 * settings.debugMode is on (see PerfMonitor), so it costs nothing for
 * normal users. */
export function usePerfStats(): PerfStats {
  const [stats, setStats] = useState<PerfStats>({
    fps: 0,
    usedJsHeapMB: null,
    lastAiLatencyMs: null,
    lastToolLatencyMs: null,
  });

  const framesRef = useRef(0);
  const lastSampleRef = useRef(performance.now());
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    function tick(now: number) {
      framesRef.current += 1;
      const elapsed = now - lastSampleRef.current;
      if (elapsed >= 1000) {
        const fps = Math.round((framesRef.current * 1000) / elapsed);
        framesRef.current = 0;
        lastSampleRef.current = now;

        const perfWithMemory = performance as Performance & { memory?: PerformanceMemory };
        const usedJsHeapMB = perfWithMemory.memory
          ? Math.round(perfWithMemory.memory.usedJSHeapSize / 1024 / 1024)
          : null;

        setStats((prev) => ({ ...prev, fps, usedJsHeapMB }));
      }
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  useEventListener("ai.response", (payload) => {
    setStats((prev) => ({ ...prev, lastAiLatencyMs: payload.latencyMs }));
  });

  useEventListener("tool.completed", (payload) => {
    setStats((prev) => ({ ...prev, lastToolLatencyMs: payload.latencyMs }));
  });

  return stats;
}
