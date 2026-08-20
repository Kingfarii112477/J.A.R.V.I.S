"use client";

import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

interface HudPanelProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  variant?: "default" | "tactical";
  corners?: boolean;
  interactive?: boolean;
}

export function HudPanel({
  children,
  variant = "default",
  corners = false,
  interactive = false,
  className,
  ...rest
}: HudPanelProps) {
  return (
    <div
      className={cn(
        "rounded-xl p-4",
        variant === "default" ? "hud-panel" : "hud-panel-tactical",
        corners && "hud-corner",
        interactive && "cursor-pointer transition-all duration-300 hover:border-cyan/40 hover:shadow-[0_0_24px_-6px_rgba(34,211,238,0.35)]",
        className
      )}
      {...rest}
    >
      {children}
    </div>
  );
}
