"use client";

import { cn } from "@/lib/utils/cn";

interface CoreFallbackProps {
  color?: string;
  label?: string;
}

/** CSS-only stand-in rendered when WebGL is unavailable, so the shell never
 * shows a blank hole where the core should be. */
export function CoreFallback({ color = "#22d3ee", label = "3D ACCELERATION UNAVAILABLE" }: CoreFallbackProps) {
  return (
    <div className="relative flex h-full w-full items-center justify-center">
      <div
        className="animate-spin-slow absolute h-3/5 w-3/5 rounded-full border-2 opacity-70"
        style={{ borderColor: color }}
      />
      <div
        className="animate-spin-reverse absolute h-4/5 w-4/5 rounded-full border opacity-40"
        style={{ borderColor: color }}
      />
      <div
        className="animate-pulse-slow h-1/4 w-1/4 rounded-full"
        style={{ background: color, boxShadow: `0 0 60px 12px ${color}` }}
      />
      <span
        className={cn(
          "font-technical absolute bottom-2 text-[10px] tracking-[0.2em]",
          "text-text-muted"
        )}
      >
        {label}
      </span>
    </div>
  );
}
