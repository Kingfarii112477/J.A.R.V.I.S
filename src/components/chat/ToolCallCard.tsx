"use client";

import { Wrench, Loader2, CheckCircle2, XCircle, ShieldAlert, Lock } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { toolRegistry } from "@/lib/tools/registry";
import type { ChatMessage } from "@/types/jarvis";

const TOOL_LABELS: Record<string, string> = {
  system_status: "SystemStatus",
  run_diagnostics: "DiagnosticsService",
  memory_search: "MemorySearch",
  memory_store: "MemoryStore",
  memory_delete: "MemoryDelete",
  open_screen: "Navigation",
  web_search: "WebSearch",
  calculator: "Calculator",
  time: "TimeService",
  weather: "WeatherService",
  n8n_workflow: "AutomationWorkflow",
  get_workflow_status: "WorkflowStatus",
};

type ToolCall = NonNullable<ChatMessage["toolCall"]>;

interface ToolCallCardProps {
  toolCall: ToolCall;
  onConfirm?: () => void;
  onCancel?: () => void;
}

export function ToolCallCard({ toolCall, onConfirm, onCancel }: ToolCallCardProps) {
  const label = TOOL_LABELS[toolCall.toolName] ?? toolCall.toolName;
  const definition = toolRegistry.get(toolCall.toolName);

  return (
    <div
      className={cn(
        "hud-panel rounded-xl px-3 py-2.5",
        toolCall.status === "pending_confirmation" ? "border-warning/40" : "border-violet/25"
      )}
    >
      <div className="flex items-center gap-2">
        <Wrench size={13} className="text-violet" />
        <span className="font-technical text-[10px] tracking-[0.15em] text-violet">TOOL</span>
        <span className="font-body text-sm text-text-primary">{label}</span>
        <StatusChip status={toolCall.status} />
      </div>

      {toolCall.status === "pending_confirmation" && (
        <div className="mt-2.5 rounded-lg border border-warning/25 bg-warning/5 p-3">
          <div className="flex items-center gap-1.5 text-warning">
            <Lock size={13} />
            <span className="font-technical text-[10px] tracking-[0.15em]">ACTION REQUIRES AUTHORIZATION</span>
          </div>
          <dl className="mt-2 space-y-1">
            <div className="flex gap-2 text-xs">
              <dt className="w-14 shrink-0 font-technical tracking-[0.08em] text-text-muted">OPERATION</dt>
              <dd className="text-text-secondary">{definition?.description ?? toolCall.toolName}</dd>
            </div>
            <div className="flex gap-2 text-xs">
              <dt className="w-14 shrink-0 font-technical tracking-[0.08em] text-text-muted">RISK</dt>
              <dd className="text-warning">{definition?.riskNote ?? "This action will make changes based on the parameters shown."}</dd>
            </div>
          </dl>
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={onConfirm}
              className="flex-1 rounded-lg border border-cyan/40 bg-cyan/10 py-1.5 text-[10px] font-technical tracking-[0.1em] text-cyan hover:bg-cyan/20"
            >
              AUTHORIZE
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 rounded-lg border border-text-muted/30 py-1.5 text-[10px] font-technical tracking-[0.1em] text-text-muted hover:text-text-primary"
            >
              CANCEL
            </button>
          </div>
        </div>
      )}

      {(toolCall.status === "success" || toolCall.status === "error" || toolCall.status === "cancelled") && toolCall.summary && (
        <div className="mt-2 border-t border-cyan/10 pt-2">
          <p className="font-technical text-[9px] tracking-[0.12em] text-text-muted">RESULT</p>
          <p className={cn("mt-0.5 text-sm", toolCall.status === "error" ? "text-danger" : "text-text-primary")}>{toolCall.summary}</p>
        </div>
      )}
    </div>
  );
}

function StatusChip({ status }: { status: ToolCall["status"] }) {
  if (status === "running") {
    return (
      <span className="ml-auto flex items-center gap-1 font-technical text-[9px] tracking-[0.1em] text-cyan">
        <Loader2 size={11} className="animate-spin" /> EXECUTING...
      </span>
    );
  }
  if (status === "success") {
    return (
      <span className="ml-auto flex items-center gap-1 font-technical text-[9px] tracking-[0.1em] text-success">
        <CheckCircle2 size={11} /> COMPLETE
      </span>
    );
  }
  if (status === "error") {
    return (
      <span className="ml-auto flex items-center gap-1 font-technical text-[9px] tracking-[0.1em] text-danger">
        <XCircle size={11} /> FAILED
      </span>
    );
  }
  if (status === "cancelled") {
    return (
      <span className="ml-auto flex items-center gap-1 font-technical text-[9px] tracking-[0.1em] text-text-muted">
        <XCircle size={11} /> CANCELLED
      </span>
    );
  }
  return (
    <span className="ml-auto flex items-center gap-1 font-technical text-[9px] tracking-[0.1em] text-warning">
      <ShieldAlert size={11} /> AWAITING CONFIRMATION
    </span>
  );
}
