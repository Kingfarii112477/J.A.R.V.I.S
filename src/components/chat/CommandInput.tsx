"use client";

import { useRef, type KeyboardEvent } from "react";
import { Mic, Send, Square } from "lucide-react";
import { cn } from "@/lib/utils/cn";

interface CommandInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onMic?: () => void;
  onStop?: () => void;
  generating?: boolean;
  disabled?: boolean;
  placeholder?: string;
}

export function CommandInput({
  value,
  onChange,
  onSend,
  onMic,
  onStop,
  generating = false,
  disabled = false,
  placeholder = "Type a command...",
}: CommandInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && value.trim() && !disabled) {
      onSend();
    }
  }

  return (
    <div className="hud-panel flex items-center gap-2 rounded-full px-2 py-1.5">
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        aria-label="Command input"
        className="flex-1 bg-transparent px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-muted disabled:opacity-50"
      />
      {onMic && (
        <button
          type="button"
          onClick={onMic}
          aria-label="Voice input"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-panel-strong hover:text-cyan"
        >
          <Mic size={17} />
        </button>
      )}
      {generating ? (
        <button
          type="button"
          onClick={onStop}
          aria-label="Stop generating"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-danger/50 text-danger transition-colors hover:bg-danger/10"
        >
          <Square size={14} fill="currentColor" />
        </button>
      ) : (
        <button
          type="button"
          onClick={onSend}
          disabled={disabled || !value.trim()}
          aria-label="Send"
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition-colors",
            value.trim() && !disabled
              ? "glow-cyan border-cyan bg-cyan/15 text-cyan"
              : "border-cyan/15 text-text-muted"
          )}
        >
          <Send size={15} />
        </button>
      )}
    </div>
  );
}
