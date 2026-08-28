"use client";

import { Rocket, Play, Pause, X, CheckCircle2, XCircle, Loader2, Circle, Lock, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { agentRegistry } from "@/lib/agents/registry";
import { toolRegistry } from "@/lib/tools/registry";
import { useMissionPendingApproval } from "@/hooks/useMissionPendingApproval";
import type { MissionSnapshot } from "@/lib/orchestration/missionSnapshot";

interface MissionCardProps {
  mission: MissionSnapshot;
  onStart?: () => void;
  onPause?: () => void;
  onResume?: () => void;
  onCancel?: () => void;
  onAuthorizeApproval?: (approvalId: string) => void;
  onDenyApproval?: (approvalId: string) => void;
}

function agentLabel(agentId: string) {
  return agentRegistry.getAgent(agentId as never)?.name ?? agentId;
}

function TaskStatusIcon({ status }: { status: string }) {
  if (status === "COMPLETED") return <CheckCircle2 size={12} className="text-success" />;
  if (status === "FAILED" || status === "BLOCKED") return <XCircle size={12} className="text-danger" />;
  if (status === "RUNNING") return <Loader2 size={12} className="animate-spin text-cyan" />;
  if (status === "CANCELLED") return <XCircle size={12} className="text-text-muted" />;
  return <Circle size={10} className="text-text-muted" />;
}

/** Cinematic mission proposal/progress/authorization card — the Phase 4
 * counterpart to ToolCallCard, following the same visual language
 * (hud-panel, technical labels, AUTHORIZE/DENY pattern) rather than
 * introducing a new card style. Embedded directly in ChatMessage.mission
 * exactly like ChatMessage.toolCall already embeds ToolCallCard's state. */
export function MissionCard({ mission, onStart, onPause, onResume, onCancel, onAuthorizeApproval, onDenyApproval }: MissionCardProps) {
  const pendingApproval = useMissionPendingApproval(mission.missionId);
  const progress = mission.estimatedSteps > 0 ? Math.round((mission.completedSteps / mission.estimatedSteps) * 100) : 0;

  return (
    <div className="hud-panel rounded-xl border-cyan/25 px-3 py-2.5">
      <div className="flex items-center gap-2">
        <Rocket size={13} className="text-cyan" />
        <span className="font-technical text-[10px] tracking-[0.15em] text-cyan">MISSION</span>
        <MissionStatusChip status={mission.status} />
      </div>

      <p className="mt-1.5 text-sm text-text-primary">{mission.objective}</p>

      {mission.status !== "DRAFT" && (
        <div className="mt-2">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-panel-strong">
            <div className="h-full rounded-full bg-cyan transition-all" style={{ width: `${progress}%` }} />
          </div>
          <p className="mt-1 font-technical text-[9px] tracking-[0.1em] text-text-muted">
            {mission.completedSteps}/{mission.estimatedSteps} STEPS COMPLETE
            {mission.failureCount > 0 && ` — ${mission.failureCount} FAILED`}
          </p>
        </div>
      )}

      <ul className="mt-2 flex flex-col gap-1">
        {mission.tasks.map((t) => (
          <li key={t.id} className="flex items-center gap-1.5 text-xs">
            <TaskStatusIcon status={t.status} />
            <span className="text-text-secondary">{t.title}</span>
            <span className="ml-auto font-technical text-[9px] tracking-[0.08em] text-text-muted">{agentLabel(t.agent)}</span>
          </li>
        ))}
      </ul>

      {pendingApproval && (
        <div className="mt-2.5 rounded-lg border border-warning/25 bg-warning/5 p-3">
          <div className="flex items-center gap-1.5 text-warning">
            <Lock size={13} />
            <span className="font-technical text-[10px] tracking-[0.15em]">ACTION REQUIRES AUTHORIZATION</span>
          </div>
          <dl className="mt-2 space-y-1">
            <div className="flex gap-2 text-xs">
              <dt className="w-14 shrink-0 font-technical tracking-[0.08em] text-text-muted">OPERATION</dt>
              <dd className="text-text-secondary">
                {pendingApproval.toolName ? (toolRegistry.get(pendingApproval.toolName)?.description ?? pendingApproval.toolName) : "Authorize the mission plan"}
              </dd>
            </div>
            {pendingApproval.agent && (
              <div className="flex gap-2 text-xs">
                <dt className="w-14 shrink-0 font-technical tracking-[0.08em] text-text-muted">AGENT</dt>
                <dd className="text-text-secondary">{agentLabel(pendingApproval.agent)}</dd>
              </div>
            )}
            <div className="flex gap-2 text-xs">
              <dt className="w-14 shrink-0 font-technical tracking-[0.08em] text-text-muted">RISK</dt>
              <dd className="flex items-center gap-1 text-warning">
                <ShieldAlert size={11} /> {pendingApproval.risk}
              </dd>
            </div>
          </dl>
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={() => onAuthorizeApproval?.(pendingApproval.id)}
              className="flex-1 rounded-lg border border-cyan/40 bg-cyan/10 py-1.5 text-[10px] font-technical tracking-[0.1em] text-cyan hover:bg-cyan/20"
            >
              AUTHORIZE
            </button>
            <button
              type="button"
              onClick={() => onDenyApproval?.(pendingApproval.id)}
              className="flex-1 rounded-lg border border-text-muted/30 py-1.5 text-[10px] font-technical tracking-[0.1em] text-text-muted hover:text-text-primary"
            >
              DENY
            </button>
          </div>
        </div>
      )}

      {mission.synthesis && (
        <div className="mt-2 border-t border-cyan/10 pt-2">
          <p className="font-technical text-[9px] tracking-[0.12em] text-text-muted">SYNTHESIS</p>
          <p className="mt-0.5 text-sm text-text-primary">{mission.synthesis}</p>
        </div>
      )}
      {mission.error && (
        <div className="mt-2 border-t border-cyan/10 pt-2">
          <p className="font-technical text-[9px] tracking-[0.12em] text-danger">{mission.status === "PAUSED" ? "PAUSED" : "ERROR"}</p>
          <p className="mt-0.5 text-sm text-danger">{mission.error}</p>
        </div>
      )}

      {!pendingApproval && (
        <div className="mt-3 flex items-center gap-2">
          {mission.status === "DRAFT" && (
            <button
              type="button"
              onClick={onStart}
              className="flex-1 rounded-lg border border-cyan/40 bg-cyan/10 py-1.5 text-[10px] font-technical tracking-[0.1em] text-cyan hover:bg-cyan/20"
            >
              <Play size={11} className="mr-1 inline" /> START MISSION
            </button>
          )}
          {mission.status === "RUNNING" && (
            <>
              <button type="button" onClick={onPause} className="flex-1 rounded-lg border border-warning/30 py-1.5 text-[10px] font-technical tracking-[0.1em] text-warning hover:bg-warning/10">
                <Pause size={11} className="mr-1 inline" /> PAUSE
              </button>
              <button type="button" onClick={onCancel} className="flex-1 rounded-lg border border-danger/30 py-1.5 text-[10px] font-technical tracking-[0.1em] text-danger hover:bg-danger/10">
                <X size={11} className="mr-1 inline" /> CANCEL
              </button>
            </>
          )}
          {mission.status === "PAUSED" && (
            <>
              <button type="button" onClick={onResume} className="flex-1 rounded-lg border border-cyan/40 bg-cyan/10 py-1.5 text-[10px] font-technical tracking-[0.1em] text-cyan hover:bg-cyan/20">
                <Play size={11} className="mr-1 inline" /> RESUME
              </button>
              <button type="button" onClick={onCancel} className="flex-1 rounded-lg border border-danger/30 py-1.5 text-[10px] font-technical tracking-[0.1em] text-danger hover:bg-danger/10">
                <X size={11} className="mr-1 inline" /> CANCEL
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function MissionStatusChip({ status }: { status: MissionSnapshot["status"] }) {
  const map: Record<MissionSnapshot["status"], { label: string; className: string; icon: React.ReactNode }> = {
    DRAFT: { label: "PROPOSED", className: "text-text-muted", icon: <Circle size={10} /> },
    QUEUED: { label: "QUEUED", className: "text-text-muted", icon: <Circle size={10} /> },
    RUNNING: { label: "EXECUTING", className: "text-cyan", icon: <Loader2 size={11} className="animate-spin" /> },
    AWAITING_APPROVAL: { label: "AWAITING APPROVAL", className: "text-warning", icon: <Lock size={11} /> },
    PAUSED: { label: "PAUSED", className: "text-warning", icon: <Pause size={11} /> },
    COMPLETED: { label: "COMPLETE", className: "text-success", icon: <CheckCircle2 size={11} /> },
    FAILED: { label: "FAILED", className: "text-danger", icon: <XCircle size={11} /> },
    CANCELLED: { label: "CANCELLED", className: "text-text-muted", icon: <XCircle size={11} /> },
  };
  const entry = map[status];
  return (
    <span className={cn("ml-auto flex items-center gap-1 font-technical text-[9px] tracking-[0.1em]", entry.className)}>
      {entry.icon} {entry.label}
    </span>
  );
}
