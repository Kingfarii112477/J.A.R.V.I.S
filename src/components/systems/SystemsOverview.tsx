"use client";

import { useEffect, useState } from "react";
import { BrainCircuit, Mic, Database, ShieldCheck, Atom, Crosshair, ChevronDown, Zap } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { JarvisCore } from "@/components/3d/JarvisCore";
import { HudPanel } from "@/components/hud/HudPanel";
import { DataSourceBadge } from "@/components/common/DataSourceBadge";
import { ResearchPanel } from "./ResearchPanel";
import { listAutomations } from "@/lib/automation/client";
import { useJarvisStore } from "@/store/jarvisStore";
import { useJarvisState } from "@/hooks/useJarvisState";
import type { SubsystemId } from "@/types/jarvis";
import { cn } from "@/lib/utils/cn";

const subsystemIcons: Record<SubsystemId, typeof BrainCircuit> = {
  neuralCore: BrainCircuit,
  voiceSystem: Mic,
  memoryBank: Database,
  securityGrid: ShieldCheck,
  quantumLink: Atom,
  tacticalMatrix: Crosshair,
};

const stateColor: Record<string, string> = {
  ONLINE: "text-success",
  DEGRADED: "text-warning",
  OFFLINE: "text-danger",
};

export function SystemsOverview() {
  const { state } = useJarvisState();
  const quality = useJarvisStore((s) => s.settings.graphicsQuality);
  const subsystems = useJarvisStore((s) => s.subsystems);
  const protocols = useJarvisStore((s) => s.protocols);
  const diagnosticsRunning = useJarvisStore((s) => s.diagnosticsRunning);
  const aiConnection = useJarvisStore((s) => s.aiConnection);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [n8nConnected, setN8nConnected] = useState<boolean | null>(null);

  useEffect(() => {
    listAutomations().then((workflows) => setN8nConnected(workflows.length > 0));
  }, []);

  const avgHealth = Math.round(subsystems.reduce((sum, s) => sum + s.health, 0) / subsystems.length);
  const allOnline = subsystems.every((s) => s.state === "ONLINE");

  return (
    <div className="flex flex-col gap-4">
      <HudPanel className="scanline-sweep flex flex-col items-center overflow-hidden py-2">
        <div className="h-[220px] w-[220px] sm:h-[260px] sm:w-[260px] lg:h-[320px] lg:w-[320px]">
          <JarvisCore state={state} quality={quality} className="h-full w-full" />
        </div>
        <p className={cn("font-technical -mt-1 pb-2 text-[11px] tracking-[0.2em]", allOnline ? "text-success" : "text-warning")}>
          {allOnline ? "ALL SYSTEMS OPERATIONAL" : "SYSTEM ATTENTION REQUIRED"}
        </p>
      </HudPanel>

      <HudPanel corners className="flex items-center justify-between">
        <span className="font-body text-sm font-medium text-text-primary">SYSTEM HEALTH</span>
        <span className="font-display text-3xl text-text-primary">{avgHealth}%</span>
      </HudPanel>

      {diagnosticsRunning && (
        <div className="flex items-center gap-2 rounded-lg border border-cyan/25 bg-cyan/5 px-3 py-2 text-cyan">
          <Zap size={14} className="animate-pulse-slow" />
          <span className="font-technical text-[11px] tracking-[0.1em]">DIAGNOSTICS IN PROGRESS — LIVE READINGS UPDATING</span>
        </div>
      )}

      <HudPanel className="divide-y divide-cyan/10 p-0">
        {subsystems.map((s) => {
          const Icon = subsystemIcons[s.id];
          const isExpanded = expanded === s.id;
          return (
            <div key={s.id}>
              <button
                type="button"
                onClick={() => setExpanded(isExpanded ? null : s.id)}
                className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-panel-strong"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-cyan/25 text-cyan">
                  <Icon size={16} />
                </span>
                <span className="flex-1 font-body text-sm text-text-primary">{s.label}</span>
                <span className={cn("font-technical text-xs tracking-[0.1em]", stateColor[s.state])}>{s.state}</span>
                <ChevronDown size={15} className={cn("text-text-muted transition-transform", isExpanded && "rotate-180")} />
              </button>
              <AnimatePresence initial={false}>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="grid grid-cols-3 gap-2 px-4 pb-4">
                      <StatBlock label="HEALTH" value={`${Math.round(s.health)}%`} />
                      <StatBlock label="LATENCY" value={`${Math.round(s.latencyMs)}ms`} />
                      <StatBlock label="ACTIVITY" value={`${Math.round(s.activity)}%`} />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </HudPanel>

      <div className="px-1">
        <p className="font-technical mb-2 text-[10px] tracking-[0.2em] text-text-muted">POWER &amp; PROTOCOL SYSTEM</p>
        <HudPanel className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {protocols.map((p) => (
            <div key={p.id} className="flex items-center justify-between rounded-lg bg-panel-strong px-3 py-2.5">
              <span className="font-body text-xs text-text-secondary">{p.label}</span>
              <span
                className={cn(
                  "font-technical text-[10px] tracking-[0.1em]",
                  p.status === "ACTIVE" ? "text-success" : p.status === "STANDBY" ? "text-warning" : "text-text-muted"
                )}
              >
                {p.status}
              </span>
            </div>
          ))}
        </HudPanel>
      </div>

      <div className="px-1">
        <p className="font-technical mb-2 text-[10px] tracking-[0.2em] text-text-muted">DATA SOURCES</p>
        <div className="flex flex-col gap-2">
          <DataSourceBadge
            label="AI CORE"
            status={aiConnection === "connected" ? "connected" : aiConnection === "unknown" ? "unavailable" : "simulated"}
          />
          <DataSourceBadge label="NETWORK / TELEMETRY" status="simulated" />
          <DataSourceBadge label="N8N AUTOMATION" status={n8nConnected === null ? "unavailable" : n8nConnected ? "connected" : "not-connected"} />
        </div>
      </div>

      <ResearchPanel />
    </div>
  );
}

function StatBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-panel-strong px-3 py-2 text-center">
      <p className="font-technical text-[9px] tracking-[0.15em] text-text-muted">{label}</p>
      <p className="font-display text-sm text-text-primary">{value}</p>
    </div>
  );
}
