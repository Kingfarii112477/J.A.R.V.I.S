"use client";

import { useCallback, useRef } from "react";
import type { AIMessage } from "@/lib/ai/types";

interface SendOptions {
  message: string;
  sessionId: string;
  history: AIMessage[];
  onChunk: (delta: string) => void;
  onDone: () => void;
  onError: (message: string) => void;
}

/** Client-side half of the AI chat pipeline: posts to /api/chat and reads
 * the streamed response progressively via the Fetch body reader. Shared by
 * the Chat screen and Voice screen (voice sends its transcript through the
 * same path so both surfaces stay in sync). */
export function useAI() {
  const controllerRef = useRef<AbortController | null>(null);

  const send = useCallback(async ({ message, sessionId, history, onChunk, onDone, onError }: SendOptions) => {
    const controller = new AbortController();
    controllerRef.current = controller;

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, sessionId, history }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({ error: "AI core connection lost." }));
        onError(data.error ?? "AI core connection lost.");
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        onChunk(decoder.decode(value, { stream: true }));
      }
      onDone();
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        onDone();
        return;
      }
      onError(err instanceof Error ? err.message : "Network error contacting AI core.");
    } finally {
      controllerRef.current = null;
    }
  }, []);

  const stop = useCallback(() => {
    controllerRef.current?.abort();
  }, []);

  return { send, stop };
}
