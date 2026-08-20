import { motion } from "framer-motion";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { CoreAvatar } from "@/components/common/CoreAvatar";
import { TypingIndicator } from "./TypingIndicator";
import type { ChatMessage } from "@/types/jarvis";
import { cn } from "@/lib/utils/cn";

interface MessageBubbleProps {
  message: ChatMessage;
  onRetry?: () => void;
}

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function MessageBubble({ message, onRetry }: MessageBubbleProps) {
  const isUser = message.role === "user";
  const isEmpty = !message.content && message.status === "streaming";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={cn("flex items-end gap-2.5", isUser && "flex-row-reverse")}
    >
      {!isUser && <CoreAvatar size={30} active={message.status === "streaming"} />}
      <div className={cn("flex max-w-[82%] flex-col sm:max-w-[70%]", isUser && "items-end")}>
        <div
          className={cn(
            "rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap",
            isUser
              ? "rounded-br-sm border border-blue/30 bg-blue/15 text-text-primary"
              : "hud-panel rounded-bl-sm text-text-primary",
            message.status === "error" && "border-danger/40 bg-danger/10"
          )}
        >
          {isEmpty ? (
            <TypingIndicator />
          ) : (
            <>
              {message.content}
              {message.status === "streaming" && <span className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse bg-cyan align-middle" />}
            </>
          )}
        </div>
        <div className="mt-1 flex items-center gap-2 px-1">
          <span className="font-technical text-[10px] tracking-[0.08em] text-text-muted">{formatTime(message.createdAt)}</span>
          {message.status === "error" && (
            <button
              type="button"
              onClick={onRetry}
              className="flex items-center gap-1 text-[10px] font-technical tracking-[0.08em] text-danger hover:text-orange"
            >
              <AlertTriangle size={10} /> RETRY <RotateCcw size={10} />
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}
