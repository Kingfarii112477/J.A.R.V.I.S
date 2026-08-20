"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useJarvisStore } from "@/store/jarvisStore";
import { useJarvisState } from "@/hooks/useJarvisState";
import { useAI } from "@/hooks/useAI";
import { dispatchCommand } from "@/lib/commands/dispatcher";
import { generateId, getSessionId } from "@/lib/utils/id";
import { getTTSProvider } from "@/lib/voice/tts";

/**
 * Shared orchestration for "user text in, J.A.R.V.I.S response out":
 * command dispatch first, AI provider fallback second, optional
 * text-to-speech on completion, and jarvis-state transitions throughout.
 * Used by both the Chat screen and the Voice screen so a spoken command and
 * a typed one behave identically and land in the same conversation.
 */
export function useMessagePipeline() {
  const router = useRouter();
  const addMessage = useJarvisStore((s) => s.addMessage);
  const updateMessage = useJarvisStore((s) => s.updateMessage);
  const settings = useJarvisStore((s) => s.settings);

  const { goThinking, goSpeaking, goProcessing, goIdle, goError } = useJarvisState();
  const { send, stop } = useAI();

  const [generating, setGenerating] = useState(false);
  const bufferRef = useRef("");
  const sessionId = useRef(getSessionId());

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

  function runAIPath(userText: string, history: { role: "user" | "assistant"; content: string }[], onFinalText?: (text: string) => void) {
    goThinking();
    const assistantId = generateId("msg");
    bufferRef.current = "";
    addMessage({ id: assistantId, role: "assistant", content: "", createdAt: Date.now(), status: "streaming" });
    setGenerating(true);

    send({
      message: userText,
      sessionId: sessionId.current,
      history,
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

    return assistantId;
  }

  /** Sends `text` through the dispatcher first, then the AI provider if
   * unhandled. Pushes the user message itself. `history` should be prior
   * conversation turns for AI context. */
  function sendMessage(text: string, history: { role: "user" | "assistant"; content: string }[], onFinalText?: (text: string) => void) {
    addMessage({ id: generateId("msg"), role: "user", content: text, createdAt: Date.now(), status: "complete" });

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

    runAIPath(text, history, onFinalText);
  }

  return { sendMessage, runAIPath, generating, stop, speak };
}
