"use client";

import { cn } from "@/lib/utils/cn";

interface ProgressBarProps {
  value: number; // 0..100
  color?: string;
  trackClassName?: string;
  className?: string;
  height?: number;
}

export function ProgressBar({ value, color = "#22d3ee", className, trackClassName, height = 8 }: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div
      className={cn("w-full overflow-hidden rounded-full bg-panel-strong", trackClassName)}
      style={{ height }}
      role="progressbar"
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={cn("h-full rounded-full transition-[width] duration-500 ease-out", className)}
        style={{ width: `${clamped}%`, background: color, boxShadow: `0 0 12px ${color}` }}
      />
    </div>
  );
}
