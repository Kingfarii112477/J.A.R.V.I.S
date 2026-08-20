"use client";

import { useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useJarvisStore } from "@/store/jarvisStore";
import { useJarvisState } from "@/hooks/useJarvisState";
import { useAI } from "@/hooks/useAI";
import { dispatchCommand } from "@/lib/commands/dispatcher";
import { generateId, getSessionId } from "@/lib/utils/id";
import { getTTSProvider } from "@/lib/voice/tts";
import { memoryClient } from "@/lib/memory/client";
import { extractMemoriesFromText } from "@/lib/memory/extraction";
import { executeTool } from "@/lib/tools";
import { routeToTool, type ToolRouteMatch } from "@/lib/tools/router";

/**
 * Shared orchestration for "user text in, J.A.R.V.I.S response out":
 * command dispatch first, then the deterministic tool router (calculator,
 * time, weather, web/memory search), then the AI provider as a fallback —
 * with a retrieved-memory context and passive memory extraction layered
 * around the AI path, optional text-to-speech on completion, and
 * jarvis-state transitions throughout. Used by both the Chat screen and
 * the Voice screen so a spoken command and a typed one behave identically
 * and land in the same conversation.
 */
export function useMessagePipeline() {
  const router = useRouter();
  const pathname = usePathname();
  const addMessage = useJarvisStore((s) => s.addMessage);
  const updateMessage = useJarvisStore((s) => s.updateMessage);
  const settings = useJarvisStore((s) => s.settings);

  const { state: jarvisState, goThinking, goSpeaking, goProcessing, goIdle, goError } = useJarvisState();
  const { send, stop } = useAI();

  const [generating, setGenerating] = useState(false);
  const bufferRef = useRef("");
  const sessionId = useRef(getSessionId());
  const pendingToolsRef = useRef<Map<string, ToolRouteMatch>>(new Map());

  function speak(text: string, onEnd?: () => void) {
    if (!settings.autoSpeak || !settings.voiceEnabled) {
      onEnd?.();
      return;
    }
    getTTSProvider().speak(text, {
      rate: settings.voiceRate,
      pitch: settings.voicePitch,
      onEnd: () => onEnd?.(),
    });
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

  function runAIPath(userText: string, history: { role: "user" | "assistant"; content: string }[], onFinalText?: (text: string) => void) {
    goThinking();
    const assistantId = generateId("msg");
    bufferRef.current = "";
    addMessage({ id: assistantId, role: "assistant", content: "", createdAt: Date.now(), status: "streaming" });
    setGenerating(true);

    const tasks = useJarvisStore.getState().tasks;
    const activeTask = tasks.find((t) => t.status === "RUNNING") ?? tasks.find((t) => t.status === "PENDING");

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
        activeTaskTitle: activeTask?.title,
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

  async function confirmTool(msgId: string, onFinalText?: (text: string) => void) {
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
    const pending = pendingToolsRef.current.get(msgId);
    if (!pending) return;
    pendingToolsRef.current.delete(msgId);
    updateMessage(msgId, {
      content: "Cancelled.",
      toolCall: { toolName: pending.toolName, status: "cancelled", summary: "Cancelled by user.", args: pending.args },
    });
    goIdle();
  }

  /** Sends `text` through the dispatcher first, then the tool router, then
   * the AI provider if neither handled it. Pushes the user message itself.
   * `history` should be prior conversation turns for AI context. */
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

    const toolMatch = routeToTool(text);
    if (toolMatch) {
      void runToolPath(toolMatch, onFinalText);
      return;
    }

    runAIPath(text, history, onFinalText);
  }

  return { sendMessage, runAIPath, confirmTool, cancelTool, generating, stop, speak };
}
