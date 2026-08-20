"use client";

import { Wrench, Loader2, CheckCircle2, XCircle, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import type { ChatMessage } from "@/types/jarvis";

const TOOL_LABELS: Record<string, string> = {
  system_status: "SystemStatus",
  run_diagnostics: "DiagnosticsService",
  memory_search: "MemorySearch",
  memory_store: "MemoryStore",
  open_screen: "Navigation",
  web_search: "WebSearch",
  calculator: "Calculator",
  time: "TimeService",
  weather: "WeatherService",
  n8n_workflow: "AutomationWorkflow",
};

type ToolCall = NonNullable<ChatMessage["toolCall"]>;

interface ToolCallCardProps {
  toolCall: ToolCall;
  onConfirm?: () => void;
  onCancel?: () => void;
}

export function ToolCallCard({ toolCall, onConfirm, onCancel }: ToolCallCardProps) {
  const label = TOOL_LABELS[toolCall.toolName] ?? toolCall.toolName;

  return (
    <div className="hud-panel rounded-xl border-violet/25 px-3 py-2.5">
      <div className="flex items-center gap-2">
        <Wrench size={13} className="text-violet" />
        <span className="font-technical text-[10px] tracking-[0.15em] text-violet">TOOL</span>
        <span className="font-body text-sm text-text-primary">{label}</span>
        <StatusChip status={toolCall.status} />
      </div>

      {toolCall.status === "pending_confirmation" && (
        <div className="mt-2.5 flex items-center gap-2">
          <ShieldAlert size={13} className="shrink-0 text-warning" />
          <p className="flex-1 text-xs text-text-secondary">This action requires confirmation before it runs.</p>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-lg border border-cyan/40 bg-cyan/10 px-2.5 py-1 text-[10px] font-technical tracking-[0.08em] text-cyan hover:bg-cyan/20"
          >
            CONFIRM
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-text-muted/30 px-2.5 py-1 text-[10px] font-technical tracking-[0.08em] text-text-muted hover:text-text-primary"
          >
            CANCEL
          </button>
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
