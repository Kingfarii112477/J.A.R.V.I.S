"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { MessageBubble } from "./MessageBubble";
import { CommandInput } from "./CommandInput";
import { HudPanel } from "@/components/hud/HudPanel";
import { useJarvisStore } from "@/store/jarvisStore";
import { useMessagePipeline } from "@/hooks/useMessagePipeline";
import { useSound } from "@/hooks/useSound";
import { generateId } from "@/lib/utils/id";
import type { ChatMessage } from "@/types/jarvis";

const GREETING: ChatMessage = {
  id: "greeting",
  role: "assistant",
  content: "Good to see you. All systems are functioning within optimal parameters. How may I assist you today?",
  createdAt: Date.now(),
  status: "complete",
};

export function ChatWindow() {
  const router = useRouter();
  const messages = useJarvisStore((s) => s.messages);
  const addMessage = useJarvisStore((s) => s.addMessage);
  const updateMessage = useJarvisStore((s) => s.updateMessage);
  const clearMessages = useJarvisStore((s) => s.clearMessages);
  const aiConnection = useJarvisStore((s) => s.aiConnection);

  const { sendMessage, runAIPath, confirmTool, cancelTool, generating, stop } = useMessagePipeline();
  const playSound = useSound();

  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const greetedRef = useRef(false);

  useEffect(() => {
    if (greetedRef.current) return;
    greetedRef.current = true;
    if (useJarvisStore.getState().messages.length === 0) addMessage(GREETING);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  function historyFor(upToIndex?: number) {
    const slice = upToIndex === undefined ? messages : messages.slice(0, upToIndex);
    return slice
      .slice(-10)
      .filter((m) => m.role !== "system")
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
  }

  function handleSend() {
    const text = input.trim();
    if (!text || generating) return;
    setInput("");
    playSound("click");
    sendMessage(text, historyFor());
  }

  function handleRetry(assistantId: string) {
    const idx = messages.findIndex((m) => m.id === assistantId);
    const lastUser = [...messages.slice(0, idx)].reverse().find((m) => m.role === "user");
    if (!lastUser) return;
    updateMessage(assistantId, { content: "", status: "streaming" });
    runAIPath(lastUser.content, historyFor(idx));
  }

  function handleClear() {
    if (window.confirm("Clear the entire conversation? This cannot be undone.")) {
      clearMessages();
      addMessage({ ...GREETING, id: generateId("msg") });
    }
  }

  return (
    <div className="flex h-[calc(100vh-9rem)] flex-col gap-3 lg:h-[calc(100vh-6rem)]">
      <div className="flex items-center justify-between px-1">
        <p className="font-technical text-[10px] tracking-[0.2em] text-text-muted">
          {aiConnection === "connected" ? "LIVE AI CORE" : aiConnection === "error" ? "CONNECTION UNSTABLE" : "SIMULATION MODE"}
        </p>
        <button
          type="button"
          onClick={handleClear}
          aria-label="Clear conversation"
          className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-text-muted transition-colors hover:bg-panel-strong hover:text-danger"
        >
          <Trash2 size={14} />
          <span className="font-technical text-[10px] tracking-[0.1em]">CLEAR</span>
        </button>
      </div>

      <HudPanel className="scanline-sweep flex-1 overflow-y-auto">
        <div className="flex flex-col gap-4 p-1">
          {messages.map((m) => (
            <MessageBubble
              key={m.id}
              message={m}
              onRetry={() => handleRetry(m.id)}
              onConfirmTool={() => confirmTool(m.id)}
              onCancelTool={() => cancelTool(m.id)}
            />
          ))}
          <div ref={bottomRef} />
        </div>
      </HudPanel>

      <CommandInput
        value={input}
        onChange={setInput}
        onSend={handleSend}
        onMic={() => router.push("/voice")}
        onStop={stop}
        generating={generating}
        placeholder="Type a command..."
      />
    </div>
  );
}
