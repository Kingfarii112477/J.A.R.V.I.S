"use client";

import { useEffect, useRef, useState } from "react";

/** Keeps a rolling window of recent values for a metric so cards can render
 * a sparkline without every screen managing its own history buffer. */
export function useMetricHistory(value: number, length = 24) {
  const [history, setHistory] = useState<number[]>(() => Array(length).fill(value));
  const lastPushRef = useRef(0);

  useEffect(() => {
    const now = performance.now();
    if (now - lastPushRef.current < 350) return;
    lastPushRef.current = now;
    setHistory((prev) => [...prev.slice(1), value]);
  }, [value]);

  return history;
}
