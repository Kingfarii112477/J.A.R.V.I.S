"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronRight, MessageSquare, Mic, Activity, Radar } from "lucide-react";
import { JarvisCore } from "@/components/3d/JarvisCore";
import { HudPanel } from "@/components/hud/HudPanel";
import { MetricCard } from "@/components/hud/MetricCard";
import { textColor } from "@/components/common/StatusIndicator";
import { useJarvisStore } from "@/store/jarvisStore";
import { useJarvisState, stateLabel, stateDescription } from "@/hooks/useJarvisState";
import { useSound } from "@/hooks/useSound";
import { cn } from "@/lib/utils/cn";
import { TaskPanel } from "./TaskPanel";

const quickActions = [
  { id: "chat", label: "Chat", href: "/chat", icon: MessageSquare },
  { id: "voice", label: "Voice", href: "/voice", icon: Mic },
  { id: "diagnostics", label: "Diagnostics", href: "/diagnostics", icon: Activity },
  { id: "radar", label: "Radar", href: "/radar", icon: Radar },
] as const;

export function Dashboard() {
  const router = useRouter();
  const { state } = useJarvisState();
  const quality = useJarvisStore((s) => s.settings.graphicsQuality);
  const telemetry = useJarvisStore((s) => s.telemetry);
  const protocols = useJarvisStore((s) => s.protocols);
  const pushTerminalLine = useJarvisStore((s) => s.pushTerminalLine);
  const playSound = useSound();

  const [protocolsExpanded, setProtocolsExpanded] = useState(false);
  const activeProtocols = protocols.filter((p) => p.status === "ACTIVE").length;

  function handleActivateProtocols() {
    playSound("click");
    setProtocolsExpanded((v) => !v);
    pushTerminalLine({ kind: "system", text: `Protocol matrix reaffirmed — ${activeProtocols}/${protocols.length} active.` });
  }

  const protocolsPanel = (
    <HudPanel interactive corners onClick={handleActivateProtocols} className="lg:flex-1">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-body text-sm font-medium text-text-primary">ACTIVE PROTOCOLS</p>
          <p className="font-technical text-[11px] tracking-[0.08em] text-success">
            {activeProtocols} PROTOCOLS RUNNING
          </p>
        </div>
        <motion.span animate={{ rotate: protocolsExpanded ? 90 : 0 }}>
          <ChevronRight size={18} className="text-text-muted" />
        </motion.span>
      </div>
      <AnimatePresence initial={false}>
        {protocolsExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-3 grid grid-cols-1 gap-1.5 border-t border-cyan/10 pt-3 sm:grid-cols-2 lg:grid-cols-1">
              {protocols.map((p) => (
                <div key={p.id} className="flex items-center justify-between rounded-lg bg-panel-strong px-3 py-2">
                  <span className="font-body text-xs text-text-secondary">{p.label}</span>
                  <span
                    className={cn(
                      "font-technical text-[10px] tracking-[0.1em]",
                      p.status === "ACTIVE" ? "text-success" : "text-text-muted"
                    )}
                  >
                    {p.status}
                  </span>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </HudPanel>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-stretch">
        <HudPanel className="scanline-sweep flex flex-1 flex-col items-center justify-center overflow-hidden py-2">
          <div
            className="h-[280px] w-[280px] sm:h-[340px] sm:w-[340px] lg:h-[380px] lg:w-[380px]"
            role="button"
            tabIndex={0}
            aria-label="Open chat with J.A.R.V.I.S"
            onKeyDown={(e) => e.key === "Enter" && router.push("/chat")}
          >
            <JarvisCore state={state} quality={quality} onClick={() => router.push("/chat")} className="h-full w-full cursor-pointer" />
          </div>
          <p className="font-technical -mt-2 pb-3 text-[10px] tracking-[0.2em] text-text-muted">
            TAP CORE TO OPEN CHAT
          </p>
        </HudPanel>

        <div className="flex flex-col gap-4 lg:w-[320px] lg:shrink-0">
          <HudPanel interactive corners onClick={() => router.push("/systems")} className="flex items-center justify-between">
            <div>
              <p className="font-body text-sm font-medium text-text-primary">SYSTEM STATUS</p>
              <p className="font-technical text-[11px] tracking-[0.08em] text-text-muted">{stateDescription[state]}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className={cn("font-display text-lg tracking-[0.15em]", textColor[state])}>{stateLabel[state]}</span>
              <ChevronRight size={18} className="text-text-muted" />
            </div>
          </HudPanel>

          {protocolsPanel}

          <div className="hidden grid-cols-2 gap-3 lg:grid">
            {quickActions.map((action) => {
              const Icon = action.icon;
              return (
                <HudPanel
                  key={action.id}
                  interactive
                  onClick={() => router.push(action.href)}
                  className="flex flex-col items-center gap-2 py-4 text-center"
                >
                  <Icon size={20} className="text-cyan" />
                  <span className="font-technical text-[10px] tracking-[0.15em] text-text-secondary">
                    {action.label.toUpperCase()}
                  </span>
                </HudPanel>
              );
            })}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard label="CPU USAGE" value={telemetry.cpu} color="#22d3ee" />
        <MetricCard label="NEURAL ACTIVITY" value={telemetry.neuralActivity} color="#8b5cf6" sparklineVariant="bars" />
        <MetricCard label="AI STABILITY" value={telemetry.aiStability} color="#3b82f6" sparklineVariant="bars" />
        <MetricCard label="SIGNAL STRENGTH" value={telemetry.signalStrength} color="#67e8f9" sparklineVariant="bars" />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:hidden">
        {quickActions.map((action) => {
          const Icon = action.icon;
          return (
            <HudPanel
              key={action.id}
              interactive
              onClick={() => router.push(action.href)}
              className="flex flex-col items-center gap-2 py-4 text-center"
            >
              <Icon size={20} className="text-cyan" />
              <span className="font-technical text-[10px] tracking-[0.15em] text-text-secondary">
                {action.label.toUpperCase()}
              </span>
            </HudPanel>
          );
        })}
      </div>

      <TaskPanel />
    </div>
  );
}
