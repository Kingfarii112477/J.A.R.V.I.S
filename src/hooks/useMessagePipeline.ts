"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useJarvisStore } from "@/store/jarvisStore";
import { useJarvisState } from "@/hooks/useJarvisState";
import { useAI } from "@/hooks/useAI";
import { dispatchCommand } from "@/lib/commands/dispatcher";
import { generateId, getSessionId } from "@/lib/utils/id";
import { getTTSProvider, browserTTSProvider } from "@/lib/voice/tts";
import { eventBus, type JarvisEventName } from "@/lib/events/bus";
import { memoryClient } from "@/lib/memory/client";
import { extractMemoriesFromText } from "@/lib/memory/extraction";
import { executeTool } from "@/lib/tools";
import { routeToTool, type ToolRouteMatch } from "@/lib/tools/router";
import { ReasoningEngine, type ReasoningRequestInput } from "@/lib/reasoning/engine";
import { looksLikeMissionObjective } from "@/lib/planning/objectiveDetection";
import { orchestrator } from "@/lib/orchestration/orchestrator";
import { toMissionSnapshot } from "@/lib/orchestration/missionSnapshot";
import type { ToolCallStatus } from "@/types/jarvis";

type ConfirmResolver = (approved: boolean) => void;

/**
 * Shared orchestration for "user text in, J.A.R.V.I.S response out":
 * command dispatch first, then the Phase 3 reasoning engine (true
 * multi-step LLM tool calling) when a capable provider is configured,
 * falling back to the Phase 2 deterministic tool router + plain AI
 * streaming when it isn't — with a retrieved-memory context and passive
 * memory extraction layered around both AI paths, optional
 * text-to-speech on completion, and jarvis-state transitions throughout.
 * Used by both the Chat screen and the Voice screen so a spoken command
 * and a typed one behave identically and land in the same conversation
 * (and go through exactly the same reasoning engine — there is no
 * separate voice intelligence path).
 */
export function useMessagePipeline() {
  const router = useRouter();
  const pathname = usePathname();
  const addMessage = useJarvisStore((s) => s.addMessage);
  const updateMessage = useJarvisStore((s) => s.updateMessage);
  const settings = useJarvisStore((s) => s.settings);
  const pushToast = useJarvisStore((s) => s.pushToast);

  const { state: jarvisState, goThinking, goSpeaking, goProcessing, goIdle, goError, goWarning } = useJarvisState();
  const { send, stop: stopAIStream } = useAI();

  const [generating, setGenerating] = useState(false);
  const bufferRef = useRef("");
  const sessionId = useRef(getSessionId());
  const pendingToolsRef = useRef<Map<string, ToolRouteMatch>>(new Map());
  const reasoningConfirmResolversRef = useRef<Map<string, ConfirmResolver>>(new Map());
  const reasoningAbortRef = useRef<AbortController | null>(null);
  /** missionId -> the chat message id displaying that mission's card, so
   * mission.* and agent.* event-bus events (fired by the orchestrator,
   * which has no direct UI callback hooks the way ReasoningEngine does)
   * can find and refresh the right message. */
  const missionMsgIdRef = useRef<Map<string, string>>(new Map());
  /** The most recently proposed DRAFT mission's chat message id — lets
   * voice (which has no button to click) start/cancel it by saying
   * "proceed"/"cancel" instead, per the spec's voice mission example. */
  const pendingMissionRef = useRef<{ msgId: string; missionId: string } | null>(null);
  /** Last status spoken for a mission, so completion/failure/pause is
   * announced exactly once (not on every intermediate task-progress
   * refresh) — voice users get "Mission complete" without a blow-by-blow
   * narration of every step. */
  const missionSpokenStatusRef = useRef<Map<string, string>>(new Map());

  async function refreshMissionMessage(missionId: string) {
    const msgId = missionMsgIdRef.current.get(missionId);
    if (!msgId) return;
    const mission = await orchestrator.getMission(missionId);
    if (!mission) return;
    updateMessage(msgId, { mission: toMissionSnapshot(mission) });

    const spokenBefore = missionSpokenStatusRef.current.get(missionId);
    const terminal = mission.status === "COMPLETED" || mission.status === "FAILED" || mission.status === "PAUSED" || mission.status === "CANCELLED";
    if (terminal && spokenBefore !== mission.status) {
      missionSpokenStatusRef.current.set(missionId, mission.status);
      const line =
        mission.status === "COMPLETED"
          ? mission.synthesis
            ? `Mission complete. ${mission.synthesis}`
            : "Mission complete."
          : mission.status === "FAILED"
            ? `Mission failed. ${mission.error ?? ""}`.trim()
            : mission.status === "PAUSED"
              ? `Mission paused. ${mission.error ?? ""}`.trim()
              : "Mission cancelled.";
      speak(line, () => goIdle());
    }
  }

  // One subscription set for every mission-scoped event that should
  // refresh a visible mission card — mounted once per component using
  // this pipeline (Chat/Voice screens), matching how ToolCallCard's
  // updates flow through ReasoningEngine's own callbacks, just via the
  // event bus instead since the orchestrator drives missions
  // independently of any single screen's lifetime.
  useEffect(() => {
    const missionEvents: JarvisEventName[] = [
      "mission.started",
      "mission.task.started",
      "mission.task.completed",
      "mission.task.failed",
      "mission.task.blocked",
      "mission.task.cancelled",
      "mission.completed",
      "mission.failed",
      "mission.paused",
      "mission.resumed",
      "mission.cancelled",
      "plan.replanned",
    ];
    const offs = missionEvents.map((event) =>
      eventBus.on(event, (payload) => {
        const missionId = (payload as { missionId: string }).missionId;
        void refreshMissionMessage(missionId);
      })
    );
    const offApproval = [
      eventBus.on("approval.requested", (p) => void refreshMissionMessage(p.missionId)),
      eventBus.on("approval.granted", (p) => void refreshMissionMessage(p.missionId)),
      eventBus.on("approval.denied", (p) => void refreshMissionMessage(p.missionId)),
    ];
    return () => {
      for (const off of offs) off();
      for (const off of offApproval) off();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function speak(text: string, onEnd?: () => void, isFallback = false) {
    if (!settings.autoSpeak || !settings.voiceEnabled) {
      onEnd?.();
      return;
    }
    const provider = getTTSProvider(isFallback ? "browser" : settings.ttsProvider);
    eventBus.emit("voice.speaking", { text });
    provider.speak(text, {
      rate: settings.voiceRate,
      pitch: settings.voicePitch,
      onEnd: () => onEnd?.(),
      onError: (message, code) => {
        // A configured server TTS provider that isn't actually set up on
        // the server falls back to the browser voice once, visibly.
        if (code === "unavailable" && !isFallback && settings.ttsProvider !== "browser") {
          pushToast(`${message} Falling back to built-in speech.`, "warning");
          speak(text, onEnd, true);
          return;
        }
        onEnd?.();
      },
    });
  }

  /** Interrupts whatever is currently being spoken — cancels both the
   * configured provider and the browser fallback (harmless no-op if
   * neither is active) so a mid-fallback interrupt still stops audio. */
  function stopSpeaking() {
    getTTSProvider(settings.ttsProvider).cancel();
    browserTTSProvider.cancel();
    eventBus.emit("voice.interrupted", {});
    goIdle();
  }

  /** Cancels whichever AI path is currently in flight — the plain
   * streaming fetch or an active multi-step reasoning run. */
  function stop() {
    stopAIStream();
    reasoningAbortRef.current?.abort();
  }

  /** Fire-and-forget: only stores memories the extractor actually
   * recognized as stable/explicit — never blindly logs the raw message. */
  function extractAndStoreMemories(userText: string) {
    const extracted = extractMemoriesFromText(userText);
    for (const memory of extracted) {
      memoryClient.store({ ...memory, source: "user" }).catch(() => {
        // Best-effort — a failed memory write shouldn't interrupt the
        // conversation.
      });
    }
  }

  async function gatherRetrievedMemories(userText: string) {
    try {
      const results = await memoryClient.search(userText, 5);
      return results.map((r) => ({ content: r.content, type: r.type }));
    } catch {
      return [];
    }
  }

  function activeTaskTitle() {
    const tasks = useJarvisStore.getState().tasks;
    return (tasks.find((t) => t.status === "RUNNING") ?? tasks.find((t) => t.status === "PENDING"))?.title;
  }

  function runAIPath(userText: string, history: { role: "user" | "assistant"; content: string }[], onFinalText?: (text: string) => void) {
    goThinking();
    const assistantId = generateId("msg");
    bufferRef.current = "";
    addMessage({ id: assistantId, role: "assistant", content: "", createdAt: Date.now(), status: "streaming" });
    setGenerating(true);

    gatherRetrievedMemories(userText).then((retrievedMemories) => {
      send({
        message: userText,
        sessionId: sessionId.current,
        history,
        screen: pathname?.replace("/", "") || "dashboard",
        jarvisState,
        addressUser: settings.aiAddressUser || undefined,
        verbosity: settings.aiPersonalityVerbosity,
        retrievedMemories,
        activeTaskTitle: activeTaskTitle(),
        onChunk: (delta) => {
          bufferRef.current += delta;
          goSpeaking();
          updateMessage(assistantId, { content: bufferRef.current });
        },
        onDone: () => {
          updateMessage(assistantId, { status: "complete" });
          setGenerating(false);
          if (bufferRef.current) {
            onFinalText?.(bufferRef.current);
            speak(bufferRef.current, () => goIdle());
          } else {
            goIdle();
          }
        },
        onError: (message) => {
          updateMessage(assistantId, {
            status: "error",
            content: bufferRef.current || `AI CORE CONNECTION LOST — ${message}`,
          });
          setGenerating(false);
          goError();
          setTimeout(() => goIdle(), 1600);
        },
      });
    });

    return assistantId;
  }

  function toolContext() {
    return { sessionId: sessionId.current, source: "chat" as const, navigate: (href: string) => router.push(href) };
  }

  async function runToolPath(match: ToolRouteMatch, onFinalText?: (text: string) => void) {
    goProcessing();
    const msgId = generateId("msg");
    addMessage({
      id: msgId,
      role: "assistant",
      content: "",
      createdAt: Date.now(),
      status: "complete",
      toolCall: { toolName: match.toolName, status: "running", args: match.args },
    });

    const result = await executeTool(match.toolName, match.args, toolContext());

    if (result.needsConfirmation) {
      pendingToolsRef.current.set(msgId, match);
      updateMessage(msgId, { toolCall: { toolName: match.toolName, status: "pending_confirmation", args: match.args } });
      goIdle();
      return;
    }

    if (result.ok) {
      updateMessage(msgId, {
        content: result.summary ?? "",
        toolCall: { toolName: match.toolName, status: "success", summary: result.summary, args: match.args },
      });
      goSpeaking();
      onFinalText?.(result.summary ?? "");
      speak(result.summary ?? "", () => goIdle());
    } else {
      updateMessage(msgId, {
        content: result.error ?? "Tool execution failed.",
        toolCall: { toolName: match.toolName, status: "error", summary: result.error, args: match.args },
      });
      goError();
      setTimeout(() => goIdle(), 1500);
    }
  }

  /** Runs the full Phase 3 reasoning loop for one user turn. Every text
   * delta streams into a single assistant bubble (created lazily, on the
   * first delta of whichever turn actually produces user-visible text —
   * tool-calling turns from well-behaved models carry no content of
   * their own), and every tool call becomes its own message using the
   * exact same ToolCallCard lifecycle the Phase 2 deterministic tool
   * router already established, so multi-step reasoning renders as a
   * natural sequence of tool cards followed by a final answer. Falls
   * back to the Phase 2 path unchanged when no capable provider is
   * configured. */
  async function runReasoningPath(
    userText: string,
    history: { role: "user" | "assistant"; content: string }[],
    onFinalText?: (text: string) => void
  ) {
    goThinking();
    setGenerating(true);

    const callIdToMsgId = new Map<string, string>();
    let assistantMsgId: string | null = null;
    let assistantBuffer = "";

    const controller = new AbortController();
    reasoningAbortRef.current = controller;

    const retrievedMemories = await gatherRetrievedMemories(userText);
    const previousToolExecutions = useJarvisStore
      .getState()
      .messages.filter((m) => m.toolCall && (m.toolCall.status === "success" || m.toolCall.status === "error"))
      .slice(-5)
      .map((m) => ({
        toolName: m.toolCall!.toolName,
        summary: m.toolCall!.summary ?? "",
        ok: m.toolCall!.status === "success",
      }));
    const input: ReasoningRequestInput = {
      userText,
      sessionId: sessionId.current,
      screen: pathname?.replace("/", "") || "dashboard",
      jarvisState,
      addressUser: settings.aiAddressUser || undefined,
      verbosity: settings.aiPersonalityVerbosity,
      retrievedMemories,
      activeTaskTitle: activeTaskTitle(),
      previousToolExecutions,
      history,
    };

    const { incrementActiveToolCalls, decrementActiveToolCalls } = useJarvisStore.getState();

    const engine = new ReasoningEngine();
    const result = await engine.run(input, toolContext(), {
      // A slow, deliberate pulse each time the model reasons again —
      // "reasoning: slow intelligent pulse".
      onIteration: () => goThinking(),
      onTextDelta: (delta) => {
        if (!assistantMsgId) {
          assistantMsgId = generateId("msg");
          addMessage({ id: assistantMsgId, role: "assistant", content: "", createdAt: Date.now(), status: "streaming" });
        }
        assistantBuffer += delta;
        goSpeaking();
        updateMessage(assistantMsgId, { content: assistantBuffer });
      },
      onToolCallStart: (call) => {
        const msgId = generateId("msg");
        callIdToMsgId.set(call.callId, msgId);
        // "tool execution: orbital energy movement" (PROCESSING) — and
        // each concurrent call bumps the core's particle activity a
        // little further ("multiple tools: increased particle activity").
        incrementActiveToolCalls();
        goProcessing();
        addMessage({
          id: msgId,
          role: "assistant",
          content: "",
          createdAt: Date.now(),
          status: "complete",
          toolCall: { toolName: call.toolName, status: "running", args: call.args as Record<string, unknown> | undefined },
        });
      },
      onToolCallResult: (callId, toolResult) => {
        decrementActiveToolCalls();
        const msgId = callIdToMsgId.get(callId);
        if (!msgId) return;
        const current = useJarvisStore.getState().messages.find((m) => m.id === msgId)?.toolCall;
        const status: ToolCallStatus = toolResult.cancelled ? "cancelled" : toolResult.ok ? "success" : "error";
        // "tool error: warning pulse" — a genuine failure (not a user
        // cancellation, which is an intentional choice, not an anomaly).
        if (status === "error") goWarning();
        updateMessage(msgId, {
          content: status === "success" ? (toolResult.summary ?? "") : "",
          toolCall: {
            toolName: current?.toolName ?? toolResult.toolName,
            status,
            summary: toolResult.ok ? toolResult.summary : toolResult.error,
            args: current?.args,
          },
        });
      },
      onNeedsConfirmation: (call) => {
        const msgId = callIdToMsgId.get(call.callId);
        if (msgId) {
          const current = useJarvisStore.getState().messages.find((m) => m.id === msgId)?.toolCall;
          updateMessage(msgId, { toolCall: { toolName: current?.toolName ?? call.toolName, status: "pending_confirmation", args: current?.args } });
        }
        // "confirmation: orange tactical pulse" — WARNING is J.A.R.V.I.S's
        // existing orange-accented state, reused here rather than adding a
        // new one.
        goWarning();
        return new Promise<boolean>((resolve) => {
          if (msgId) reasoningConfirmResolversRef.current.set(msgId, resolve);
          else resolve(false);
        });
      },
    }, { signal: controller.signal });

    reasoningAbortRef.current = null;

    if (!result.usedReasoning) {
      // No tool-calling-capable provider configured — drop back to the
      // unchanged Phase 2 path exactly as if reasoning had never been
      // attempted.
      const toolMatch = routeToTool(userText);
      if (toolMatch) {
        await runToolPath(toolMatch, onFinalText);
        setGenerating(false);
        return;
      }
      runAIPath(userText, history, onFinalText);
      return;
    }

    setGenerating(false);

    if (result.stoppedReason === "complete") {
      const finalText = assistantBuffer || result.finalText;
      if (!assistantMsgId && finalText) {
        assistantMsgId = generateId("msg");
        addMessage({ id: assistantMsgId, role: "assistant", content: finalText, createdAt: Date.now(), status: "complete" });
      } else if (assistantMsgId) {
        updateMessage(assistantMsgId, { status: "complete" });
      }
      if (finalText) {
        onFinalText?.(finalText);
        speak(finalText, () => goIdle());
      } else {
        goIdle();
      }
      return;
    }

    if (result.stoppedReason === "limit_iterations" || result.stoppedReason === "limit_tools" || result.stoppedReason === "timeout") {
      const note =
        assistantBuffer ||
        result.finalText ||
        "I reached the safety limit for this request before finishing — here's what I found so far.";
      if (assistantMsgId) updateMessage(assistantMsgId, { content: note, status: "complete" });
      else addMessage({ id: generateId("msg"), role: "assistant", content: note, createdAt: Date.now(), status: "complete" });
      onFinalText?.(note);
      speak(note, () => goIdle());
      return;
    }

    if (result.stoppedReason === "aborted") {
      if (assistantMsgId) updateMessage(assistantMsgId, { status: "complete" });
      goIdle();
      return;
    }

    // "error"
    const errorText = `AI CORE CONNECTION LOST — ${result.errorMessage ?? "Unknown reasoning error."}`;
    if (assistantMsgId) updateMessage(assistantMsgId, { status: "error", content: assistantBuffer || errorText });
    else addMessage({ id: generateId("msg"), role: "assistant", content: errorText, createdAt: Date.now(), status: "error" });
    goError();
    setTimeout(() => goIdle(), 1600);
  }

  async function confirmTool(msgId: string, onFinalText?: (text: string) => void) {
    const reasoningResolve = reasoningConfirmResolversRef.current.get(msgId);
    if (reasoningResolve) {
      reasoningConfirmResolversRef.current.delete(msgId);
      const current = useJarvisStore.getState().messages.find((m) => m.id === msgId)?.toolCall;
      if (current) updateMessage(msgId, { toolCall: { ...current, status: "running" } });
      goProcessing();
      reasoningResolve(true);
      return;
    }

    const pending = pendingToolsRef.current.get(msgId);
    if (!pending) return;
    updateMessage(msgId, { toolCall: { toolName: pending.toolName, status: "running", args: pending.args } });
    goProcessing();

    const result = await executeTool(pending.toolName, pending.args, toolContext(), true);
    pendingToolsRef.current.delete(msgId);

    if (result.ok) {
      updateMessage(msgId, {
        content: result.summary ?? "",
        toolCall: { toolName: pending.toolName, status: "success", summary: result.summary, args: pending.args },
      });
      goSpeaking();
      onFinalText?.(result.summary ?? "");
      speak(result.summary ?? "", () => goIdle());
    } else {
      updateMessage(msgId, {
        content: result.error ?? "Tool execution failed.",
        toolCall: { toolName: pending.toolName, status: "error", summary: result.error, args: pending.args },
      });
      goError();
      setTimeout(() => goIdle(), 1500);
    }
  }

  function cancelTool(msgId: string) {
    const reasoningResolve = reasoningConfirmResolversRef.current.get(msgId);
    if (reasoningResolve) {
      reasoningConfirmResolversRef.current.delete(msgId);
      reasoningResolve(false);
      return;
    }

    const pending = pendingToolsRef.current.get(msgId);
    if (!pending) return;
    pendingToolsRef.current.delete(msgId);
    updateMessage(msgId, {
      content: "Cancelled.",
      toolCall: { toolName: pending.toolName, status: "cancelled", summary: "Cancelled by user.", args: pending.args },
    });
    goIdle();
  }

  /** Sends `text` through the dispatcher first, then the Phase 3
   * reasoning engine (or its Phase 2 deterministic fallback when no
   * tool-calling-capable provider is configured). Pushes the user
   * message itself. `history` should be prior conversation turns for AI
   * context. */
  function sendMessage(text: string, history: { role: "user" | "assistant"; content: string }[], onFinalText?: (text: string) => void) {
    addMessage({ id: generateId("msg"), role: "user", content: text, createdAt: Date.now(), status: "complete" });
    extractAndStoreMemories(text);

    const cmd = dispatchCommand(text, { navigate: (href) => router.push(href), source: "voice" });
    if (cmd.handled) {
      goProcessing();
      window.setTimeout(() => {
        addMessage({ id: generateId("msg"), role: "assistant", content: cmd.response, createdAt: Date.now(), status: "complete" });
        goSpeaking();
        onFinalText?.(cmd.response);
        speak(cmd.response, () => goIdle());
      }, 400);
      return;
    }

    // A pending (DRAFT, not yet started) mission proposal can be
    // answered by voice with a plain "proceed"/"cancel" instead of
    // clicking the card's buttons — chat can still use the buttons, but
    // typing the same words works there too, for consistency.
    if (pendingMissionRef.current && /^(proceed|yes|start|begin|go ahead|authorize|confirm)\b/i.test(text.trim())) {
      const { msgId, missionId } = pendingMissionRef.current;
      startMission(msgId, missionId);
      return;
    }
    if (pendingMissionRef.current && /^(cancel|no|never ?mind|stop|abort)\b/i.test(text.trim())) {
      const { msgId, missionId } = pendingMissionRef.current;
      cancelMission(msgId, missionId);
      return;
    }

    if (looksLikeMissionObjective(text)) {
      void proposeMission(text, onFinalText);
      return;
    }

    void runReasoningPath(text, history, onFinalText);
  }

  /** Deterministic decomposition of `objective` into a Mission (see
   * lib/planning/planner.ts), rendered as a MissionCard the user must
   * explicitly START — never launched automatically. Mirrors the spec's
   * "MISSION PROPOSED ... [START MISSION]" flow. Also speaks a short
   * acknowledgment (muted automatically when voice/autoSpeak is off, via
   * the existing speak() gating) so a voice-only session hears it too,
   * per "Certainly, Sir. I have prepared a six-step research mission." */
  async function proposeMission(objective: string, onFinalText?: (text: string) => void) {
    goProcessing();
    const mission = await orchestrator.createMission(objective, sessionId.current, "chat");
    const msgId = generateId("msg");
    missionMsgIdRef.current.set(mission.id, msgId);
    pendingMissionRef.current = { msgId, missionId: mission.id };

    const ack =
      mission.status === "FAILED"
        ? `I couldn't build a valid plan for that: ${mission.error ?? "the plan failed validation."}`
        : `I've prepared a ${mission.tasks.length}-step mission for "${objective}". Say "proceed" to begin, or "cancel" to discard it.`;
    addMessage({ id: msgId, role: "assistant", content: ack, createdAt: Date.now(), status: "complete", mission: toMissionSnapshot(mission) });
    goSpeaking();
    onFinalText?.(ack);
    speak(ack, () => goIdle());
  }

  /** Clicking START authorizes the plan (satisfying autonomy level 3's
   * "approve the whole plan up front") and begins execution. Fire-and-
   * forget from the UI's perspective — progress streams back in via the
   * mission.* and agent.* event subscription above, not this promise. */
  function startMission(msgId: string, missionId: string) {
    missionMsgIdRef.current.set(missionId, msgId);
    if (pendingMissionRef.current?.missionId === missionId) pendingMissionRef.current = null;
    orchestrator.authorizePlan(missionId);
    goProcessing();
    speak("Mission authorized. Beginning execution.");
    orchestrator
      .startMission(missionId, toolContext())
      .then(() => refreshMissionMessage(missionId))
      .finally(() => goIdle());
  }

  function pauseMission(missionId: string) {
    orchestrator.pauseMission(missionId);
  }

  function resumeMission(msgId: string, missionId: string) {
    missionMsgIdRef.current.set(missionId, msgId);
    goProcessing();
    orchestrator
      .resumeMission(missionId, toolContext())
      .then(() => refreshMissionMessage(missionId))
      .finally(() => goIdle());
  }

  function cancelMission(msgId: string, missionId: string) {
    missionMsgIdRef.current.set(missionId, msgId);
    if (pendingMissionRef.current?.missionId === missionId) pendingMissionRef.current = null;
    void orchestrator.cancelMission(missionId).then(() => refreshMissionMessage(missionId));
  }

  function authorizeMissionApproval(approvalId: string) {
    goProcessing();
    orchestrator.resolveApproval(approvalId, true);
  }

  function denyMissionApproval(approvalId: string) {
    orchestrator.resolveApproval(approvalId, false);
  }

  return {
    sendMessage,
    runAIPath,
    confirmTool,
    cancelTool,
    generating,
    stop,
    speak,
    stopSpeaking,
    startMission,
    pauseMission,
    resumeMission,
    cancelMission,
    authorizeMissionApproval,
    denyMissionApproval,
  };
}
