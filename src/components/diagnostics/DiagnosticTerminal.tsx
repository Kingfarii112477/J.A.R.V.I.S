"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { TerminalSquare } from "lucide-react";
import { HudPanel } from "@/components/hud/HudPanel";
import { TypewriterLine } from "./TypewriterLine";
import { useJarvisStore } from "@/store/jarvisStore";
import { dispatchCommand, AVAILABLE_COMMANDS } from "@/lib/commands/dispatcher";
import { computeTabComplete, completionText, type TabCompleteState } from "@/lib/commands/autocomplete";
import { routeToTool } from "@/lib/tools/router";
import { executeTool } from "@/lib/tools";
import { memoryClient } from "@/lib/memory/client";
import { getSessionId } from "@/lib/utils/id";
import { cn } from "@/lib/utils/cn";

const SUGGESTIONS = ["system status", "run diagnostics", "security check", "memory status", "help"];

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function DiagnosticTerminal() {
  const router = useRouter();
  const lines = useJarvisStore((s) => s.terminalLines);
  const pushTerminalLine = useJarvisStore((s) => s.pushTerminalLine);
  const clearTerminal = useJarvisStore((s) => s.clearTerminal);

  const [input, setInput] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const latestOutputId = useRef<string | null>(null);
  const welcomedRef = useRef(false);
  const sessionIdRef = useRef(getSessionId());
  const tabStateRef = useRef<TabCompleteState | null>(null);

  useEffect(() => {
    if (welcomedRef.current) return;
    welcomedRef.current = true;
    if (useJarvisStore.getState().terminalLines.length === 0) {
      pushTerminalLine({ kind: "system", text: "J.A.R.V.I.S DIAGNOSTIC TERMINAL — type 'help' for available commands." });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [lines]);

  function printLines(text: string, kind: "output" | "system") {
    for (const [i, line] of text.split("\n").entries()) {
      const id = `${Date.now()}-${i}`;
      if (i === 0) latestOutputId.current = id;
      pushTerminalLine({ kind, text: line });
    }
  }

  async function submit(raw: string) {
    const text = raw.trim();
    if (!text || busy) return;
    setInput("");
    setHistory((prev) => [...prev, text]);
    setHistoryIndex(null);
    tabStateRef.current = null;
    pushTerminalLine({ kind: "input", text });

    setBusy(true);
    await delay(280 + Math.random() * 260);

    const lower = text.toLowerCase();

    // Destructive — deletes every stored memory record. Never a single
    // command wipes it all; requires a second, explicit confirmation.
    if (lower === "memory clear") {
      printLines('This permanently deletes every stored memory record. Type "memory clear confirm" to proceed.', "system");
      setBusy(false);
      return;
    }
    if (lower === "memory clear confirm") {
      try {
        const result = await memoryClient.clearAll();
        printLines(`Cleared ${result.removed} memory record(s).`, "output");
      } catch (err) {
        printLines(`Memory clear failed: ${err instanceof Error ? err.message : "Unknown error"}`, "system");
      }
      setBusy(false);
      return;
    }

    const result = dispatchCommand(text, { navigate: (href) => router.push(href), source: "terminal" });
    if (result.handled) {
      printLines(result.response, "output");
      await delay(60);
      setBusy(false);
      return;
    }

    // Not a system command — try the same deterministic tool router chat
    // and voice use (calculator, time, weather, web/memory search) before
    // giving up. Same integrity model as dispatchCommand: no LLM decides
    // what runs here.
    const toolMatch = routeToTool(text);
    if (toolMatch) {
      const execResult = await executeTool(toolMatch.toolName, toolMatch.args, {
        sessionId: sessionIdRef.current,
        source: "terminal",
        navigate: (href) => router.push(href),
      });
      if (execResult.needsConfirmation) {
        printLines(`"${toolMatch.toolName}" requires confirmation — run it from Chat or Voice to confirm.`, "system");
      } else if (execResult.ok) {
        printLines(execResult.summary ?? "Done.", "output");
      } else {
        printLines(execResult.error ?? "Tool execution failed.", "system");
      }
      await delay(60);
      setBusy(false);
      return;
    }

    printLines(`Unrecognized command: "${text}". Type 'help' for available commands.`, "system");
    setBusy(false);
  }

  function handleTabComplete() {
    const next = computeTabComplete(input, AVAILABLE_COMMANDS, tabStateRef.current);
    if (!next) return;
    tabStateRef.current = next;
    setInput(completionText(next));
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Tab") {
      e.preventDefault();
      handleTabComplete();
      return;
    }
    tabStateRef.current = null;
    if (e.key === "Enter") {
      submit(input);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (history.length === 0) return;
      const nextIndex = historyIndex === null ? history.length - 1 : Math.max(0, historyIndex - 1);
      setHistoryIndex(nextIndex);
      setInput(history[nextIndex]);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (historyIndex === null) return;
      const nextIndex = historyIndex + 1;
      if (nextIndex >= history.length) {
        setHistoryIndex(null);
        setInput("");
      } else {
        setHistoryIndex(nextIndex);
        setInput(history[nextIndex]);
      }
    }
  }

  const lastLine = lines[lines.length - 1];

  return (
    <HudPanel className="flex flex-col gap-0 p-0">
      <div className="flex items-center gap-2 border-b border-cyan/10 px-4 py-2.5">
        <TerminalSquare size={14} className="text-cyan" />
        <span className="font-technical text-[10px] tracking-[0.2em] text-text-secondary">DIAGNOSTIC TERMINAL</span>
        <button
          type="button"
          onClick={clearTerminal}
          className="ml-auto font-technical text-[10px] tracking-[0.1em] text-text-muted hover:text-danger"
        >
          CLEAR
        </button>
      </div>

      <div className="font-technical h-64 overflow-y-auto px-4 py-3 text-[12px] leading-relaxed sm:h-72">
        {lines.map((line) => {
          const isLast = line.id === lastLine?.id;
          return (
            <div
              key={line.id}
              className={cn(
                line.kind === "input" && "text-cyan",
                line.kind === "output" && "text-text-primary",
                line.kind === "system" && "text-text-muted italic"
              )}
            >
              {line.kind === "input" ? "> " : line.kind === "output" ? "  " : "· "}
              {isLast && line.kind !== "input" ? <TypewriterLine text={line.text} /> : line.text}
            </div>
          );
        })}
        {busy && <div className="text-text-muted">...</div>}
        <div ref={bottomRef} />
      </div>

      <div className="flex flex-wrap gap-1.5 border-t border-cyan/10 px-4 py-2">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => submit(s)}
            className="font-technical rounded-full border border-cyan/20 px-2.5 py-1 text-[10px] tracking-[0.05em] text-text-secondary hover:border-cyan/50 hover:text-cyan"
          >
            {s}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2 border-t border-cyan/10 px-4 py-2.5">
        <span className="font-technical text-cyan">{">"}</span>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={busy ? "processing..." : "enter command"}
          disabled={busy}
          aria-label="Terminal command input"
          list="terminal-commands"
          className="font-technical flex-1 bg-transparent text-xs text-text-primary outline-none placeholder:text-text-muted disabled:opacity-50"
        />
        <span className="h-3.5 w-1.5 animate-pulse bg-cyan" aria-hidden />
        <datalist id="terminal-commands">
          {AVAILABLE_COMMANDS.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </div>
    </HudPanel>
  );
}
