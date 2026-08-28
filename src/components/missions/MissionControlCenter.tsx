"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Rocket, ListChecks, CheckCircle2, XCircle } from "lucide-react";
import { HudPanel } from "@/components/hud/HudPanel";
import { AutonomyLevelControl } from "./AutonomyLevelControl";
import { AgentNetworkPanel } from "./AgentNetworkPanel";
import { MissionCard } from "@/components/chat/MissionCard";
import { useMissions } from "@/hooks/useMissions";
import { orchestrator } from "@/lib/orchestration/orchestrator";
import { toMissionSnapshot } from "@/lib/orchestration/missionSnapshot";
import { getSessionId } from "@/lib/utils/id";
import { cn } from "@/lib/utils/cn";
import type { Mission } from "@/lib/planning/planTypes";

const ACTIVE_STATUSES: Mission["status"][] = ["RUNNING", "PAUSED", "AWAITING_APPROVAL", "QUEUED"];

function StatusBadge({ status }: { status: Mission["status"] }) {
  const color =
    status === "COMPLETED" ? "text-success" : status === "FAILED" || status === "CANCELLED" ? "text-danger" : status === "RUNNING" ? "text-cyan" : "text-warning";
  return <span className={cn("font-technical text-[9px] tracking-[0.1em]", color)}>{status.replace(/_/g, " ")}</span>;
}

/**
 * Mission Control — combines the spec's four requested panels (Autonomy
 * Center / Mission Control / Agent Network / Task Queue) into one
 * screen with sections, the same way this codebase already nests
 * Security Center inside Settings and the Terminal inside Diagnostics,
 * rather than four separate top-level routes for what is really one
 * cohesive "autonomous operations" surface.
 */
export function MissionControlCenter() {
  const router = useRouter();
  const missions = useMissions();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const active = missions.filter((m) => ACTIVE_STATUSES.includes(m.status));
  const completed = missions.filter((m) => m.status === "COMPLETED").length;
  const failed = missions.filter((m) => m.status === "FAILED").length;
  const successRate = completed + failed > 0 ? Math.round((completed / (completed + failed)) * 100) : null;

  const selected = missions.find((m) => m.id === selectedId) ?? active[0] ?? missions[0] ?? null;

  function toolCtx() {
    return { sessionId: getSessionId(), source: "button" as const, navigate: (href: string) => router.push(href) };
  }

  return (
    <div className="flex flex-col gap-4">
      <HudPanel>
        <div className="flex flex-wrap items-center gap-6">
          <div className="flex items-center gap-2">
            <Rocket size={15} className="text-cyan" />
            <span className="font-technical text-[10px] tracking-[0.15em] text-text-secondary">ACTIVE MISSIONS</span>
            <span className="font-body text-lg text-text-primary">{active.length}</span>
          </div>
          <div className="flex items-center gap-2">
            <ListChecks size={15} className="text-cyan" />
            <span className="font-technical text-[10px] tracking-[0.15em] text-text-secondary">TOTAL MISSIONS</span>
            <span className="font-body text-lg text-text-primary">{missions.length}</span>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle2 size={15} className="text-success" />
            <span className="font-technical text-[10px] tracking-[0.15em] text-text-secondary">SUCCESS RATE</span>
            <span className="font-body text-lg text-text-primary">{successRate === null ? "—" : `${successRate}%`}</span>
          </div>
          {failed > 0 && (
            <div className="flex items-center gap-2">
              <XCircle size={15} className="text-danger" />
              <span className="font-technical text-[10px] tracking-[0.15em] text-text-secondary">FAILED</span>
              <span className="font-body text-lg text-danger">{failed}</span>
            </div>
          )}
        </div>
      </HudPanel>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <HudPanel>
          <AutonomyLevelControl />
        </HudPanel>
        <AgentNetworkPanel />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,280px)_1fr]">
        <HudPanel className="divide-y divide-cyan/10 p-0">
          <div className="px-4 py-2.5">
            <span className="font-technical text-[10px] tracking-[0.15em] text-text-secondary">TASK QUEUE — MISSIONS</span>
          </div>
          {missions.length === 0 && <p className="px-4 py-6 text-center text-sm text-text-muted">No missions yet — propose one from Chat.</p>}
          {missions.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setSelectedId(m.id)}
              className={cn("flex w-full flex-col gap-1 px-4 py-2.5 text-left transition-colors hover:bg-panel-strong", selected?.id === m.id && "bg-panel-strong")}
            >
              <div className="flex min-w-0 items-center justify-between gap-2">
                <span className="min-w-0 truncate text-sm text-text-primary">{m.objective}</span>
                <StatusBadge status={m.status} />
              </div>
              <span className="font-technical text-[9px] tracking-[0.05em] text-text-muted">
                {m.completedSteps}/{m.estimatedSteps} steps
              </span>
            </button>
          ))}
        </HudPanel>

        <div>
          {selected ? (
            <MissionCard
              mission={toMissionSnapshot(selected)}
              onStart={() => {
                orchestrator.authorizePlan(selected.id);
                void orchestrator.startMission(selected.id, toolCtx());
              }}
              onPause={() => orchestrator.pauseMission(selected.id)}
              onResume={() => void orchestrator.resumeMission(selected.id, toolCtx())}
              onCancel={() => void orchestrator.cancelMission(selected.id)}
              onAuthorizeApproval={(id) => orchestrator.resolveApproval(id, true)}
              onDenyApproval={(id) => orchestrator.resolveApproval(id, false)}
            />
          ) : (
            <HudPanel className="flex h-full items-center justify-center py-10">
              <p className="text-sm text-text-muted">Select a mission to view details.</p>
            </HudPanel>
          )}
        </div>
      </div>
    </div>
  );
}
