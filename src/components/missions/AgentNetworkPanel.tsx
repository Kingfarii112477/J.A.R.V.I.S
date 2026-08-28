"use client";

import { Circle } from "lucide-react";
import { HudPanel } from "@/components/hud/HudPanel";
import { agentRegistry } from "@/lib/agents/registry";
import { useAgentStatuses } from "@/hooks/useAgentStatuses";
import { cn } from "@/lib/utils/cn";
import type { AgentStatus } from "@/lib/agents/types";

const STATUS_COLOR: Record<AgentStatus, string> = {
  idle: "text-text-muted",
  active: "text-cyan",
  standby: "text-text-secondary",
  error: "text-danger",
};

/** Agent Network — a clean HUD status grid (mirroring the existing
 * Systems screen's subsystem-status pattern) rather than an animated
 * node-graph visualization. Every state shown here is real: agent
 * status is written by lib/orchestration/coordinator.ts as tasks
 * actually run, never simulated for effect. */
export function AgentNetworkPanel() {
  const statuses = useAgentStatuses();

  return (
    <HudPanel className="divide-y divide-cyan/10 p-0">
      <div className="flex items-center justify-between px-4 py-2.5">
        <span className="font-technical text-[10px] tracking-[0.15em] text-text-secondary">AGENT NETWORK</span>
        <span className="font-technical text-[9px] tracking-[0.1em] text-text-muted">{statuses.filter((s) => s.status === "active").length} ACTIVE</span>
      </div>
      {statuses.map((s) => {
        const def = agentRegistry.getAgent(s.agentId);
        if (!def) return null;
        return (
          <div key={s.agentId} className="flex items-center gap-3 px-4 py-2.5">
            <Circle size={8} className={cn("shrink-0 fill-current", STATUS_COLOR[s.status])} />
            <div className="min-w-0 flex-1">
              <p className="text-sm text-text-primary">{def.name}</p>
              <p className="truncate font-technical text-[9px] tracking-[0.05em] text-text-muted">
                {s.status === "active" && s.currentTaskId ? `Working — task ${s.currentTaskId.slice(-6)}` : def.role}
              </p>
            </div>
            <span className={cn("font-technical text-[9px] tracking-[0.1em]", STATUS_COLOR[s.status])}>{s.status.toUpperCase()}</span>
          </div>
        );
      })}
    </HudPanel>
  );
}
