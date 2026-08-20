"use client";

import { AlertOctagon, RotateCcw } from "lucide-react";

export function ScreenErrorFallback() {
  return (
    <div className="hud-panel flex min-h-[50vh] flex-col items-center justify-center gap-3 rounded-2xl p-8 text-center">
      <AlertOctagon size={28} className="text-danger" />
      <p className="font-display text-lg tracking-[0.15em] text-danger">AI CORE CONNECTION LOST</p>
      <p className="max-w-sm text-sm text-text-secondary">
        This panel hit an unexpected error and stopped rendering. The rest of the system is unaffected —
        try reloading this view.
      </p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="mt-2 flex items-center gap-2 rounded-lg border border-cyan/30 bg-cyan/10 px-4 py-2 text-sm text-cyan hover:bg-cyan/20"
      >
        <RotateCcw size={14} /> RETRY CONNECTION
      </button>
    </div>
  );
}
