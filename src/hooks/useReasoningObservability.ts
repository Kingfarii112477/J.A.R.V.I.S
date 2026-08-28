"use client";

import { useState } from "react";
import { useEventListener } from "@/hooks/useEventListener";

export type ReasoningRunStatus = "idle" | "running" | "complete" | "fallback" | "limit_iterations" | "limit_tools" | "timeout" | "aborted" | "error";

export interface ObservedToolCall {
  callId: string;
  toolName: string;
  status: "running" | "success" | "error";
}

export interface ReasoningObservability {
  sessionId: string | null;
  requestText: string | null;
  intent: string | null;
  providerId: string | null;
  model: string | null;
  status: ReasoningRunStatus;
  iteration: number;
  maxIterations: number | null;
  toolCalls: ObservedToolCall[];
  startedAt: number | null;
  latencyMs: number | null;
}

const EMPTY: ReasoningObservability = {
  sessionId: null,
  requestText: null,
  intent: null,
  providerId: null,
  model: null,
  status: "idle",
  iteration: 0,
  maxIterations: null,
  toolCalls: [],
  startedAt: null,
  latencyMs: null,
};

/**
 * Developer-only window into the most recent reasoning run — sourced
 * entirely from the reasoning.* and tool.* event bus events the engine
 * already emits (see lib/reasoning/engine.ts). Deliberately surfaces only
 * operational metadata (request text, classified intent, provider/model,
 * tool calls and their outcome, iteration count, timing, final status) —
 * never the model's internal reasoning/chain-of-thought, none of which is
 * captured by these events in the first place.
 */
export function useReasoningObservability(): ReasoningObservability {
  const [state, setState] = useState<ReasoningObservability>(EMPTY);

  useEventListener("reasoning.started", (payload) => {
    setState({
      sessionId: payload.sessionId,
      requestText: payload.text,
      intent: payload.intent,
      providerId: null,
      model: null,
      status: "running",
      iteration: 0,
      maxIterations: null,
      toolCalls: [],
      startedAt: Date.now(),
      latencyMs: null,
    });
  });

  useEventListener("reasoning.iteration", (payload) => {
    setState((prev) => (prev.sessionId === payload.sessionId ? { ...prev, iteration: payload.iteration, maxIterations: payload.maxIterations } : prev));
  });

  useEventListener("tool.requested", (payload) => {
    setState((prev) => {
      if (prev.sessionId !== payload.sessionId || prev.status !== "running") return prev;
      return { ...prev, toolCalls: [...prev.toolCalls, { callId: payload.callId, toolName: payload.toolName, status: "running" }] };
    });
  });

  useEventListener("tool.completed", (payload) => {
    setState((prev) => ({
      ...prev,
      toolCalls: prev.toolCalls.map((t) => (t.callId === payload.callId ? { ...t, status: payload.success ? "success" : "error" } : t)),
    }));
  });

  useEventListener("tool.failed", (payload) => {
    setState((prev) => ({
      ...prev,
      toolCalls: prev.toolCalls.map((t) => (t.callId === payload.callId ? { ...t, status: "error" } : t)),
    }));
  });

  useEventListener("reasoning.completed", (payload) => {
    setState((prev) => {
      if (prev.sessionId !== payload.sessionId) return prev;
      return {
        ...prev,
        intent: payload.intent,
        providerId: payload.providerId,
        model: payload.model,
        status: payload.stoppedReason as ReasoningRunStatus,
        latencyMs: payload.latencyMs,
      };
    });
  });

  return state;
}
