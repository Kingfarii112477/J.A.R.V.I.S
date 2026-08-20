"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { User, FileText, BrainCircuit, Share2, Crosshair, Sparkles, Database, Info } from "lucide-react";
import { HudPanel } from "@/components/hud/HudPanel";
import { ProgressBar } from "@/components/hud/ProgressBar";
import { MemoryCoreScene } from "@/components/3d/MemoryCoreScene";
import { useJarvisStore } from "@/store/jarvisStore";
import {
  loadMemoryState,
  saveMemoryState,
  optimizeMemory,
  getUsedGB,
  TOTAL_MEMORY_GB,
  type MemoryState,
} from "@/lib/memory/local";
import { useSound } from "@/hooks/useSound";
import { cn } from "@/lib/utils/cn";
import { MemoryRecordsPanel } from "./MemoryRecordsPanel";

const iconMap: Record<string, typeof User> = {
  user: User,
  "file-text": FileText,
  "brain-circuit": BrainCircuit,
  "share-2": Share2,
  crosshair: Crosshair,
};

export function MemoryCore() {
  const quality = useJarvisStore((s) => s.settings.graphicsQuality);
  const telemetry = useJarvisStore((s) => s.telemetry);
  const playSound = useSound();

  const [memory, setMemory] = useState<MemoryState | null>(null);
  const [optimizing, setOptimizing] = useState(false);

  useEffect(() => {
    setMemory(loadMemoryState());
  }, []);

  if (!memory) {
    return <div className="font-technical p-6 text-xs tracking-widest text-text-muted">LOADING MEMORY BANK...</div>;
  }

  const used = getUsedGB(memory);
  const available = TOTAL_MEMORY_GB - used;
  const usedPercent = (used / TOTAL_MEMORY_GB) * 100;

  function handleOptimize() {
    if (optimizing) return;
    setOptimizing(true);
    playSound("click");
    window.setTimeout(() => {
      setMemory((prev) => {
        const next = optimizeMemory(prev!);
        saveMemoryState(next);
        return next;
      });
      setOptimizing(false);
      playSound("notify");
      useJarvisStore.getState().pushToast("Memory optimization complete.", "success");
    }, 1400);
  }

  return (
    <div className="flex flex-col gap-4">
      <HudPanel className="scanline-sweep flex flex-col items-center overflow-hidden py-2">
        <div className="h-[260px] w-[260px] sm:h-[300px] sm:w-[300px] lg:h-[380px] lg:w-[380px]">
          <MemoryCoreScene activity={telemetry.neuralActivity / 100} quality={quality} className="h-full w-full" />
        </div>
        <p className="font-technical -mt-1 pb-2 text-[11px] tracking-[0.2em] text-violet">NEURAL DATA SYSTEM</p>
      </HudPanel>

      <div className="flex items-start gap-2 rounded-lg border border-cyan/15 bg-panel-strong px-3 py-2.5">
        <Info size={14} className="mt-0.5 shrink-0 text-cyan" />
        <p className="font-technical text-[10px] leading-relaxed tracking-[0.02em] text-text-secondary">
          CAPACITY SIMULATION — the gauges below simulate storage health, not real content. Actual
          retrievable memories (what J.A.R.V.I.S remembers about you) are the records section further down.
        </p>
      </div>

      <HudPanel corners>
        <div className="mb-3 flex items-center gap-2">
          <Database size={15} className="text-cyan" />
          <span className="font-body text-sm font-medium text-text-primary">MEMORY BANK</span>
        </div>
        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <p className="font-technical text-[10px] tracking-[0.1em] text-text-secondary">TOTAL MEMORY</p>
            <p className="font-display text-xl text-text-primary">{(TOTAL_MEMORY_GB / 1000).toFixed(1)} TB</p>
          </div>
          <div>
            <p className="font-technical text-[10px] tracking-[0.1em] text-text-secondary">USED</p>
            <p className="font-display text-xl text-text-primary">{(used / 1000).toFixed(1)} TB</p>
          </div>
          <div>
            <p className="font-technical text-[10px] tracking-[0.1em] text-text-secondary">AVAILABLE</p>
            <p className="font-display text-xl text-text-primary">{(available / 1000).toFixed(1)} TB</p>
          </div>
        </div>
        <div className="mt-3">
          <ProgressBar value={usedPercent} color="#8b5cf6" height={6} />
        </div>
        <div className="mt-2 flex items-center justify-between">
          <span className="font-technical text-[10px] tracking-[0.1em] text-text-secondary">MEMORY INTEGRITY</span>
          <span className="font-technical text-xs tracking-[0.1em] text-success">{memory.integrity}%</span>
        </div>
      </HudPanel>

      <HudPanel className="divide-y divide-cyan/10 p-0">
        {memory.categories.map((cat) => {
          const Icon = iconMap[cat.icon] ?? Database;
          return (
            <div key={cat.id} className="flex items-center gap-3 px-4 py-3.5">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: cat.color, boxShadow: `0 0 6px ${cat.color}` }} />
              <Icon size={15} className="shrink-0 text-text-secondary" />
              <span className="flex-1 font-body text-sm text-text-primary">{cat.label}</span>
              <span className="font-technical text-xs tracking-[0.05em] text-cyan">{cat.gb} GB</span>
            </div>
          );
        })}
      </HudPanel>

      <motion.button
        type="button"
        whileTap={{ scale: 0.98 }}
        disabled={optimizing}
        onClick={handleOptimize}
        className={cn(
          "hud-panel flex items-center justify-center gap-2 rounded-xl py-3.5 font-technical text-sm tracking-[0.15em] transition-colors",
          optimizing ? "text-text-muted" : "text-cyan hover:border-cyan/50 hover:bg-cyan/5"
        )}
      >
        <Sparkles size={16} className={cn(optimizing && "animate-spin-slow")} />
        {optimizing ? "OPTIMIZING..." : "OPTIMIZE MEMORY"}
      </motion.button>

      <MemoryRecordsPanel />
    </div>
  );
}
