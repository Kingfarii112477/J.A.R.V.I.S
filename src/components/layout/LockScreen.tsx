"use client";

import { useState } from "react";
import { ShieldAlert } from "lucide-react";
import { JarvisCore } from "@/components/3d/JarvisCore";
import { useJarvisStore } from "@/store/jarvisStore";

const DEMO_PASSPHRASE = "jarvis";

/**
 * Demo-mode lock screen. This is a client-side convenience gate, not real
 * authentication — there is no server session, no hashed credential store,
 * nothing protecting real data. It exists to demonstrate the locked-state
 * UX; a production build would replace this with server-validated sessions.
 */
export function LockScreen() {
  const setLocked = useJarvisStore((s) => s.setLocked);
  const [value, setValue] = useState("");
  const [error, setError] = useState(false);

  function attemptUnlock(e: React.FormEvent) {
    e.preventDefault();
    if (value.trim().toLowerCase() === DEMO_PASSPHRASE) {
      setLocked(false);
      setError(false);
      setValue("");
    } else {
      setError(true);
    }
  }

  return (
    <div className="circuit-field fixed inset-0 z-50 flex flex-col items-center justify-center bg-void px-6">
      <div className="h-56 w-56">
        <JarvisCore state="WARNING" quality="balanced" className="h-full w-full" />
      </div>
      <h2 className="font-display mt-2 text-xl tracking-[0.25em] text-orange">SYSTEM LOCKED</h2>
      <p className="font-technical mt-1 flex items-center gap-1.5 text-[10px] tracking-[0.15em] text-text-muted">
        <ShieldAlert size={12} /> DEMO AUTHENTICATION — CLIENT-SIDE ONLY
      </p>

      <form onSubmit={attemptUnlock} className="mt-6 flex w-full max-w-xs flex-col gap-3">
        <input
          type="password"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(false);
          }}
          placeholder="Enter passphrase (demo: jarvis)"
          className="hud-panel rounded-lg px-4 py-2.5 text-sm text-text-primary outline-none placeholder:text-text-muted"
          autoFocus
        />
        {error && <p className="font-technical text-center text-[10px] tracking-[0.1em] text-danger">ACCESS DENIED — INVALID PASSPHRASE</p>}
        <button
          type="submit"
          className="rounded-lg border border-cyan/40 bg-cyan/10 py-2.5 text-sm font-medium text-cyan transition-colors hover:bg-cyan/20"
        >
          UNLOCK
        </button>
      </form>
    </div>
  );
}
