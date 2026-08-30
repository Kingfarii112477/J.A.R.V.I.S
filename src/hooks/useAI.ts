"use client";

import { useCallback, useRef } from "react";
import type { AIMessage } from "@/lib/ai/types";
import { eventBus } from "@/lib/events/bus";
import { classifyIntent } from "@/lib/ai/router";
import { isStandalone } from "@/lib/runtime/standalone";

export interface AIContextOptions {
  screen?: string;
  jarvisState?: string;
  addressUser?: string;
  verbosity?: "concise" | "balanced" | "detailed";
  retrievedMemories?: { content: string; type: string }[];
  activeTaskTitle?: string;
  toolResult?: { toolName: string; summary: string };
}

interface SendOptions extends AIContextOptions {
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
 * same path so both surfaces stay in sync). Emits ai.request/ai.response/
 * ai.error on the event bus so the perf monitor, audit log, and any future
 * subscriber can observe AI activity without being wired directly into
 * this hook. */
export function useAI() {
  const controllerRef = useRef<AbortController | null>(null);

  const send = useCallback(async ({ message, sessionId, history, onChunk, onDone, onError, ...context }: SendOptions) => {
    const controller = new AbortController();
    controllerRef.current = controller;
    const startedAt = performance.now();
    let providerId = "unknown";

    eventBus.emit("ai.request", { sessionId, text: message, intent: classifyIntent(message) });

    // Standalone Android: no /api/chat exists, so call the provider
    // directly with the on-device credentials. Everything downstream —
    // the same onChunk/onDone/onError contract and the same bus events —
    // is unchanged, so callers can't tell the transports apart.
    if (isStandalone()) {
      const { resolveStandaloneProvider, streamStandaloneCompletion } = await import(
        "@/lib/runtime/providerConfig"
      );
      const { JARVIS_SYSTEM_PROMPT } = await import("@/config/ai");
      const { assembleContext } = await import("@/lib/context/contextEngine");
      try {
        const provider = await resolveStandaloneProvider();
        if (!provider) {
          const reason =
            "No AI provider is configured. Add an API key in Settings → AI Providers to bring J.A.R.V.I.S online.";
          eventBus.emit("ai.error", { sessionId, message: reason });
          onError(reason);
          return;
        }
        providerId = provider.providerId;

        // Reuse the SAME context assembly the server route uses, so the
        // system prompt, memory and history trimming are identical.
        const assembled = assembleContext({
          systemPrompt: JARVIS_SYSTEM_PROMPT,
          screen: context.screen ?? "chat",
          jarvisState: context.jarvisState ?? "THINKING",
          aiName: "J.A.R.V.I.S.",
          addressUser: context.addressUser,
          verbosity: context.verbosity ?? "balanced",
          retrievedMemories: context.retrievedMemories ?? [],
          activeTaskTitle: context.activeTaskTitle,
          toolResult: context.toolResult,
          history,
        });

        let fullText = "";
        for await (const delta of streamStandaloneCompletion(
          provider,
          [...assembled, { role: "user", content: message }] as never,
          { temperature: 0.6, signal: controller.signal }
        )) {
          fullText += delta;
          onChunk(delta);
        }
        eventBus.emit("ai.response", {
          sessionId,
          text: fullText,
          providerId,
          latencyMs: Math.round(performance.now() - startedAt),
        });
        onDone();
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
        const reason = err instanceof Error ? err.message : "AI core connection lost.";
        eventBus.emit("ai.error", { sessionId, message: reason });
        onError(reason);
      }
      return;
    }

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, sessionId, history, ...context }),
        signal: controller.signal,
      });
      providerId = res.headers.get("X-AI-Provider") ?? "unknown";

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({ error: "AI core connection lost." }));
        const errorMessage = data.error ?? "AI core connection lost.";
        eventBus.emit("ai.error", { sessionId, message: errorMessage });
        onError(errorMessage);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        fullText += chunk;
        onChunk(chunk);
      }
      eventBus.emit("ai.response", {
        sessionId,
        text: fullText,
        providerId,
        latencyMs: Math.round(performance.now() - startedAt),
      });
      onDone();
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        onDone();
        return;
      }
      const message = err instanceof Error ? err.message : "Network error contacting AI core.";
      eventBus.emit("ai.error", { sessionId, message });
      onError(message);
    } finally {
      controllerRef.current = null;
    }
  }, []);

  const stop = useCallback(() => {
    controllerRef.current?.abort();
  }, []);

  return { send, stop };
}
