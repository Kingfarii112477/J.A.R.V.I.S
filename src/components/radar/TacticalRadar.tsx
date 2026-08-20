"use client";

import { useState } from "react";
import { Crosshair, Radar as RadarIcon, AlertTriangle, Info } from "lucide-react";
import { HudPanel } from "@/components/hud/HudPanel";
import { Sparkline } from "@/components/hud/Sparkline";
import { RadarCanvas } from "./RadarCanvas";
import { GlobalMap } from "./GlobalMap";
import { useMetricHistory } from "@/hooks/useMetricHistory";
import type { RadarTarget } from "@/types/jarvis";

export function TacticalRadar() {
  const [stats, setStats] = useState({ detected: 0, tracks: 0, threats: 0, signal: 0 });
  const signalHistory = useMetricHistory(stats.signal);

  function handleStats(targets: RadarTarget[]) {
    const threats = targets.filter((t) => t.classification === "THREAT").length;
    const tracks = targets.filter((t) => t.classification !== "UNKNOWN").length;
    const signal = targets.length
      ? Math.round((targets.reduce((sum, t) => sum + t.signal, 0) / targets.length) * 100)
      : 0;
    setStats({ detected: targets.length, tracks, threats, signal });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-2 rounded-lg border border-orange/20 bg-panel-strong px-3 py-2.5">
        <Info size={14} className="mt-0.5 shrink-0 text-orange" />
        <p className="font-technical text-[10px] leading-relaxed tracking-[0.02em] text-text-secondary">
          TACTICAL FEED SIMULATION — targets and signal readings below are generated locally, not sourced from a
          real sensor or network scan.
        </p>
      </div>

      <HudPanel variant="tactical" corners className="flex flex-col items-center py-4">
        <div className="mb-2 flex items-center gap-2 text-orange">
          <RadarIcon size={16} className="animate-spin-slow" />
          <span className="font-technical text-[11px] tracking-[0.25em]">ACTIVE</span>
        </div>
        <div className="mx-auto w-full max-w-[520px]">
          <RadarCanvas onStatsChange={handleStats} />
        </div>
      </HudPanel>

      <div className="grid grid-cols-3 gap-3">
        <HudPanel variant="tactical" className="flex flex-col items-center gap-1 py-4 text-center">
          <span className="font-technical text-[10px] tracking-[0.1em] text-text-secondary">DETECTED OBJECTS</span>
          <span className="font-display text-2xl text-orange">{stats.detected}</span>
        </HudPanel>
        <HudPanel variant="tactical" className="flex flex-col items-center gap-1 py-4 text-center">
          <span className="font-technical text-[10px] tracking-[0.1em] text-text-secondary">ACTIVE TRACKS</span>
          <span className="font-display text-2xl text-orange">{stats.tracks}</span>
        </HudPanel>
        <HudPanel variant="tactical" className="flex flex-col items-center gap-1 py-4 text-center">
          <span className="font-technical text-[10px] tracking-[0.1em] text-text-secondary">THREATS</span>
          <span className="flex items-center gap-1 font-display text-2xl text-orange">
            {stats.threats > 0 && <AlertTriangle size={16} />}
            {String(stats.threats).padStart(2, "0")}
          </span>
        </HudPanel>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1.4fr]">
        <HudPanel variant="tactical" className="flex flex-col gap-2">
          <span className="font-technical text-[10px] tracking-[0.1em] text-text-secondary">SIGNAL QUALITY</span>
          <span className="font-display text-2xl text-orange">{stats.signal}%</span>
          <Sparkline data={signalHistory} color="#ff5500" variant="bars" />
          <div className="mt-2 flex items-center justify-between border-t border-orange/15 pt-2">
            <span className="font-technical text-[10px] tracking-[0.1em] text-text-secondary">TRACKING STATUS</span>
            <span className="font-display flex items-center gap-1 text-sm text-orange">
              <Crosshair size={13} /> ACTIVE
            </span>
          </div>
        </HudPanel>
        <HudPanel variant="tactical" className="flex flex-col gap-2">
          <span className="font-technical text-[10px] tracking-[0.1em] text-text-secondary">GLOBAL SIGNAL MAP</span>
          <GlobalMap />
        </HudPanel>
      </div>
    </div>
  );
}
