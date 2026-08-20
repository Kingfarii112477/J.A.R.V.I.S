"use client";

import { cn } from "@/lib/utils/cn";

interface ToggleSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
}

export function ToggleSwitch({ checked, onChange, label }: ToggleSwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-6 w-11 shrink-0 rounded-full border transition-colors",
        checked ? "border-cyan bg-cyan/25" : "border-text-muted/40 bg-panel-strong"
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 h-[18px] w-[18px] rounded-full bg-text-primary transition-transform",
          checked ? "translate-x-[22px] bg-cyan shadow-[0_0_8px_rgba(34,211,238,0.8)]" : "translate-x-0.5"
        )}
      />
    </button>
  );
}
