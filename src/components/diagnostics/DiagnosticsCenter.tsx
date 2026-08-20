"use client";

import { useEffect, useState } from "react";
import { Crosshair, Cpu, MemoryStick, SignalHigh, BrainCircuit, Mic, ArrowLeftRight, Clock } from "lucide-react";
import { HudPanel } from "@/components/hud/HudPanel";
import { AnimatedGauge } from "@/components/hud/AnimatedGauge";
import { ProgressBar } from "@/components/hud/ProgressBar";
import { DiagnosticTerminal } from "./DiagnosticTerminal";
import { useJarvisStore } from "@/store/jarvisStore";
import { runFullDiagnostics, isDiagnosticsRunning } from "@/lib/diagnostics/run";
import { cn } from "@/lib/utils/cn";

const SESSION_START = Date.now();

function scoreLabel(score: number) {
  if (score >= 95) return { text: "EXCELLENT", color: "#34d399" };
  if (score >= 85) return { text: "GOOD", color: "#22d3ee" };
  if (score >= 70) return { text: "FAIR", color: "#f5b942" };
  return { text: "DEGRADED", color: "#ef4444" };
}

function formatUptime(ms: number) {
  const totalMinutes = Math.floor(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${minutes}m`;
}

export function DiagnosticsCenter() {
  const telemetry = useJarvisStore((s) => s.telemetry);
  const diagnosticsRunning = useJarvisStore((s) => s.diagnosticsRunning);
  const diagnosticsProgress = useJarvisStore((s) => s.diagnosticsProgress);
  const diagnosticsScore = useJarvisStore((s) => s.diagnosticsScore);
  const [uptimeMs, setUptimeMs] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setUptimeMs(Date.now() - SESSION_START), 1000);
    return () => clearInterval(interval);
  }, []);

  const { text: scoreText, color: scoreColor } = scoreLabel(diagnosticsScore);
  const uptimePercent = Math.min(100, (uptimeMs / 3_600_000) * 8);

  const metrics = [
    { id: "cpu", label: "CPU PERFORMANCE", icon: Cpu, value: telemetry.cpu, display: `${Math.round(telemetry.cpu)}%`, percent: telemetry.cpu },
    { id: "memory", label: "MEMORY USAGE", icon: MemoryStick, value: telemetry.memory, display: `${Math.round(telemetry.memory)}%`, percent: telemetry.memory },
    { id: "network", label: "NETWORK STABILITY", icon: SignalHigh, value: telemetry.networkStability, display: `${Math.round(telemetry.networkStability)}%`, percent: telemetry.networkStability },
    { id: "ai", label: "AI RESPONSE TIME", icon: BrainCircuit, value: telemetry.aiResponseMs, display: `${Math.round(telemetry.aiResponseMs)}ms`, percent: Math.max(4, 100 - telemetry.aiResponseMs / 4) },
    { id: "voice", label: "VOICE LATENCY", icon: Mic, value: telemetry.voiceLatencyMs, display: `${Math.round(telemetry.voiceLatencyMs)}ms`, percent: Math.max(4, 100 - telemetry.voiceLatencyMs / 2) },
    { id: "data", label: "DATA FLOW", icon: ArrowLeftRight, value: telemetry.dataFlow, display: `${Math.round(telemetry.dataFlow)}%`, percent: telemetry.dataFlow },
    { id: "uptime", label: "SYSTEM UPTIME", icon: Clock, value: uptimeMs, display: formatUptime(uptimeMs), percent: uptimePercent },
  ];

  return (
    <div className="flex flex-col gap-4">
      <HudPanel className="scanline-sweep flex flex-col items-center py-6">
        <AnimatedGauge value={diagnosticsScore} label={`${diagnosticsScore}%`} sublabel={scoreText} color={scoreColor} size={200} />
      </HudPanel>

      <HudPanel className="divide-y divide-cyan/10 p-0">
        {metrics.map((m) => (
          <div key={m.id} className="flex items-center gap-3 px-4 py-3">
            <m.icon size={15} className="shrink-0 text-cyan" />
            <div className="flex-1">
              <div className="mb-1.5 flex items-center justify-between">
                <span className="font-technical text-[10px] tracking-[0.12em] text-text-secondary">{m.label}</span>
                <span className="font-body text-sm text-text-primary">{m.display}</span>
              </div>
              <ProgressBar value={m.percent} color="#22d3ee" height={5} />
            </div>
          </div>
        ))}
      </HudPanel>

      <button
        type="button"
        disabled={diagnosticsRunning}
        onClick={() => {
          if (!isDiagnosticsRunning()) void runFullDiagnostics();
        }}
        className={cn(
          "hud-panel flex items-center justify-center gap-2 rounded-xl py-3.5 font-technical text-sm tracking-[0.15em] transition-colors",
          diagnosticsRunning ? "text-text-muted" : "text-cyan hover:border-cyan/50 hover:bg-cyan/5"
        )}
      >
        <Crosshair size={16} className={cn(diagnosticsRunning && "animate-spin-slow")} />
        {diagnosticsRunning ? `RUNNING DIAGNOSTICS ${diagnosticsProgress}%` : "RUN FULL DIAGNOSTICS"}
      </button>
      {diagnosticsRunning && <ProgressBar value={diagnosticsProgress} color="#22d3ee" className="glow-cyan" />}

      <DiagnosticTerminal />
    </div>
  );
}
