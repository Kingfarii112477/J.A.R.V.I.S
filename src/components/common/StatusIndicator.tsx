"use client";

import { cn } from "@/lib/utils/cn";
import type { JarvisState } from "@/types/jarvis";
import { stateLabel } from "@/hooks/useJarvisState";

export const dotColor: Record<JarvisState, string> = {
  BOOTING: "bg-blue shadow-[0_0_10px_2px_rgba(59,130,246,0.7)]",
  IDLE: "bg-success shadow-[0_0_10px_2px_rgba(52,211,153,0.7)]",
  LISTENING: "bg-cyan shadow-[0_0_10px_2px_rgba(34,211,238,0.8)]",
  THINKING: "bg-violet shadow-[0_0_10px_2px_rgba(139,92,246,0.8)]",
  SPEAKING: "bg-blue shadow-[0_0_10px_2px_rgba(59,130,246,0.8)]",
  PROCESSING: "bg-violet shadow-[0_0_10px_2px_rgba(139,92,246,0.8)]",
  DIAGNOSTICS: "bg-cyan shadow-[0_0_10px_2px_rgba(34,211,238,0.8)]",
  WARNING: "bg-orange shadow-[0_0_10px_2px_rgba(255,85,0,0.8)]",
  ERROR: "bg-danger shadow-[0_0_10px_2px_rgba(239,68,68,0.8)]",
  OFFLINE: "bg-text-muted",
};

export const textColor: Record<JarvisState, string> = {
  BOOTING: "text-blue",
  IDLE: "text-success",
  LISTENING: "text-cyan",
  THINKING: "text-violet",
  SPEAKING: "text-blue",
  PROCESSING: "text-violet",
  DIAGNOSTICS: "text-cyan",
  WARNING: "text-orange",
  ERROR: "text-danger",
  OFFLINE: "text-text-muted",
};

interface StatusIndicatorProps {
  state: JarvisState;
  label?: string;
  className?: string;
  size?: "sm" | "md";
}

export function StatusIndicator({ state, label, className, size = "md" }: StatusIndicatorProps) {
  const pulsing = state !== "OFFLINE";
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <span className="relative flex h-2.5 w-2.5">
        {pulsing && (
          <span
            className={cn("absolute inline-flex h-full w-full animate-ping rounded-full opacity-60", dotColor[state])}
          />
        )}
        <span className={cn("relative inline-flex h-2.5 w-2.5 rounded-full", dotColor[state])} />
      </span>
      <span
        className={cn(
          "font-technical tracking-[0.2em]",
          size === "sm" ? "text-[10px]" : "text-xs",
          textColor[state]
        )}
      >
        {label ?? stateLabel[state]}
      </span>
    </div>
  );
}
