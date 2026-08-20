"use client";

import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check } from "lucide-react";
import { JarvisCore } from "@/components/3d/JarvisCore";
import { ProgressBar } from "@/components/hud/ProgressBar";
import { useBootSequence } from "@/hooks/useBootSequence";
import { useSound } from "@/hooks/useSound";
import { useJarvisStore } from "@/store/jarvisStore";
import { cn } from "@/lib/utils/cn";

interface BootSequenceProps {
  onComplete: () => void;
}

export function BootSequence({ onComplete }: BootSequenceProps) {
  const playSound = useSound();
  const quality = useJarvisStore((s) => s.settings.graphicsQuality);

  const { progress, completedCount, phases, skip } = useBootSequence({
    onComplete: () => {
      playSound("boot-complete");
      onComplete();
    },
    onPhaseComplete: () => playSound("boot-phase"),
  });

  useEffect(() => {
    playSound("boot-phase");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="circuit-field fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden bg-void px-6 py-10">
      <div className="mb-2 text-center">
        <h1 className="font-display text-3xl tracking-[0.3em] text-text-primary sm:text-4xl">
          J.A.R.V.I.S.
        </h1>
        <p className="font-technical mt-2 text-[11px] tracking-[0.3em] text-cyan sm:text-xs">
          INITIALIZING NEURAL SYSTEMS
        </p>
      </div>

      <div className="relative h-[280px] w-[280px] sm:h-[340px] sm:w-[340px] lg:h-[400px] lg:w-[400px]">
        <JarvisCore state="BOOTING" quality={quality} className="h-full w-full" />
      </div>

      <div className="mt-2 w-full max-w-md">
        <div className="hud-panel scanline-sweep max-h-52 overflow-y-auto rounded-xl">
          <ul className="divide-y divide-cyan/10">
            {phases.map((phase, i) => {
              const done = i < completedCount;
              const active = i === completedCount;
              return (
                <li key={phase.id} className="flex items-center gap-3 px-4 py-2.5">
                  <span
                    className={cn(
                      "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors",
                      done
                        ? "border-success bg-success/10 text-success"
                        : active
                          ? "animate-pulse-slow border-cyan text-cyan"
                          : "border-text-muted/40 text-transparent"
                    )}
                  >
                    {done && <Check size={12} strokeWidth={3} />}
                  </span>
                  <span
                    className={cn(
                      "font-body text-sm",
                      done ? "text-text-primary" : active ? "text-cyan" : "text-text-muted"
                    )}
                  >
                    {phase.message}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="mt-5 flex flex-col items-center gap-2">
          <ProgressBar value={progress} color="#22d3ee" className="glow-cyan" height={10} />
          <AnimatePresence mode="wait">
            <motion.span
              key={Math.floor(progress)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="font-display text-xl text-cyan"
            >
              {Math.floor(progress)}%
            </motion.span>
          </AnimatePresence>
        </div>
      </div>

      <button
        type="button"
        onClick={skip}
        className="font-technical mt-6 rounded-full border border-cyan/25 px-4 py-1.5 text-[10px] tracking-[0.2em] text-text-secondary transition-colors hover:border-cyan/60 hover:text-cyan"
      >
        SKIP BOOT SEQUENCE
      </button>
    </div>
  );
}
