"use client";

import { Activity } from "lucide-react";
import { useJarvisStore } from "@/store/jarvisStore";
import { usePerfStats } from "@/hooks/usePerfStats";
import { useTelemetry } from "@/hooks/useTelemetry";
import { cn } from "@/lib/utils/cn";

/** Developer-only overlay — only rendered when settings.debugMode is on.
 * Never shown to normal users; see Settings → Advanced. */
export function PerfMonitor() {
  const debugMode = useJarvisStore((s) => s.settings.debugMode);
  const stats = usePerfStats();
  const telemetry = useTelemetry();

  if (!debugMode) return null;

  const fpsColor = stats.fps >= 50 ? "text-success" : stats.fps >= 30 ? "text-warning" : "text-danger";

  return (
    <div className="font-technical pointer-events-none fixed bottom-3 right-3 z-[55] hidden flex-col gap-1 rounded-xl border border-cyan/20 bg-panel-strong/90 px-3 py-2 text-[10px] tracking-[0.08em] text-text-secondary backdrop-blur-sm sm:flex">
      <div className="mb-1 flex items-center gap-1.5 text-cyan">
        <Activity size={11} /> PERF MONITOR
      </div>
      <Row label="FPS" value={String(stats.fps)} valueClassName={fpsColor} />
      <Row label="HEAP" value={stats.usedJsHeapMB !== null ? `${stats.usedJsHeapMB} MB` : "N/A"} />
      <Row label="AI LATENCY" value={stats.lastAiLatencyMs !== null ? `${stats.lastAiLatencyMs}ms` : "—"} />
      <Row label="TOOL LATENCY" value={stats.lastToolLatencyMs !== null ? `${stats.lastToolLatencyMs}ms` : "—"} />
      <Row label="VOICE LATENCY" value={`${Math.round(telemetry.voiceLatencyMs)}ms`} />
    </div>
  );
}

function Row({ label, value, valueClassName }: { label: string; value: string; valueClassName?: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span>{label}</span>
      <span className={cn("text-text-primary", valueClassName)}>{value}</span>
    </div>
  );
}
