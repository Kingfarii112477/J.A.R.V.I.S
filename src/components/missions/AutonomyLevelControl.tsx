"use client";

import { useJarvisStore } from "@/store/jarvisStore";
import { setAutonomyLevel } from "@/lib/autonomy/autonomyManager";
import { AUTONOMY_LEVELS, AUTONOMY_LEVEL_LABELS, AUTONOMY_LEVEL_DESCRIPTIONS, type AutonomyLevel } from "@/lib/autonomy/autonomyLevels";
import { cn } from "@/lib/utils/cn";

/** The one place in the UI that can change autonomy — a deliberate,
 * explicit user action every time (see autonomyManager.ts: autonomy
 * must never increase silently as a side effect of anything else). */
export function AutonomyLevelControl() {
  const level = useJarvisStore((s) => s.settings.autonomyLevel) as AutonomyLevel;

  return (
    <div>
      <p className="font-technical text-[10px] tracking-[0.15em] text-text-muted">AUTONOMY LEVEL</p>
      <div className="mt-2 flex gap-1.5">
        {AUTONOMY_LEVELS.map((l) => (
          <button
            key={l}
            type="button"
            onClick={() => setAutonomyLevel(l)}
            className={cn(
              "flex-1 rounded-lg border py-2 text-center transition-colors",
              l === level ? "border-cyan/50 bg-cyan/10 text-cyan" : "border-cyan/10 text-text-muted hover:border-cyan/25 hover:text-text-secondary"
            )}
          >
            <div className="font-technical text-[9px] tracking-[0.1em]">L{l}</div>
          </button>
        ))}
      </div>
      <p className="mt-2 font-technical text-[11px] tracking-[0.05em] text-cyan">{AUTONOMY_LEVEL_LABELS[level]}</p>
      <p className="mt-1 text-xs text-text-secondary">{AUTONOMY_LEVEL_DESCRIPTIONS[level]}</p>
    </div>
  );
}
