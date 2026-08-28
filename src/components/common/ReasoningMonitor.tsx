"use client";

import { BrainCircuit } from "lucide-react";
import { useReasoningObservability, type ReasoningRunStatus } from "@/hooks/useReasoningObservability";
import { cn } from "@/lib/utils/cn";

const STATUS_COLOR: Record<ReasoningRunStatus, string> = {
  idle: "text-text-secondary",
  running: "text-cyan",
  complete: "text-success",
  fallback: "text-warning",
  limit_iterations: "text-warning",
  limit_tools: "text-warning",
  timeout: "text-warning",
  aborted: "text-text-secondary",
  error: "text-danger",
};

/** Developer-only overlay showing what the reasoning engine is actually
 * doing — request/intent/provider/model/tool calls/timing/final status —
 * sourced purely from event-bus operational metadata. Never exposes the
 * model's internal reasoning text itself; only whether/what tools ran and
 * how the run ended. Mounted only when settings.debugMode is on (see
 * PerfMonitor, which follows the same pattern), so a normal user pays
 * nothing for this — not even the event subscriptions. */
export function ReasoningMonitor() {
  const run = useReasoningObservability();

  if (!run.sessionId) {
    return (
      <div className="font-technical pointer-events-none fixed bottom-3 left-3 z-[55] hidden max-w-xs flex-col gap-1 rounded-xl border border-cyan/20 bg-panel-strong/90 px-3 py-2 text-[10px] tracking-[0.08em] text-text-secondary backdrop-blur-sm sm:flex">
        <div className="flex items-center gap-1.5 text-cyan">
          <BrainCircuit size={11} /> REASONING MONITOR
        </div>
        <div>No reasoning run yet this session.</div>
      </div>
    );
  }

  return (
    <div className="font-technical pointer-events-none fixed bottom-3 left-3 z-[55] hidden max-w-xs flex-col gap-1 rounded-xl border border-cyan/20 bg-panel-strong/90 px-3 py-2 text-[10px] tracking-[0.08em] text-text-secondary backdrop-blur-sm sm:flex">
      <div className="mb-1 flex items-center gap-1.5 text-cyan">
        <BrainCircuit size={11} /> REASONING MONITOR
      </div>
      <Row label="STATUS" value={run.status.toUpperCase().replace(/_/g, " ")} valueClassName={STATUS_COLOR[run.status]} />
      <Row label="INTENT" value={run.intent ?? "—"} />
      <Row label="PROVIDER" value={run.providerId ?? "…"} />
      <Row label="MODEL" value={run.model ?? "…"} />
      <Row label="ITERATION" value={run.maxIterations ? `${run.iteration}/${run.maxIterations}` : String(run.iteration)} />
      <Row label="TOOL CALLS" value={String(run.toolCalls.length)} />
      {run.toolCalls.length > 0 && (
        <div className="mt-0.5 flex flex-col gap-0.5 border-t border-cyan/10 pt-1">
          {run.toolCalls.slice(-5).map((t) => (
            <div key={t.callId} className="flex items-center justify-between gap-3">
              <span className="truncate">{t.toolName}</span>
              <span
                className={cn(
                  "shrink-0",
                  t.status === "success" ? "text-success" : t.status === "error" ? "text-danger" : "text-cyan"
                )}
              >
                {t.status.toUpperCase()}
              </span>
            </div>
          ))}
        </div>
      )}
      <Row label="LATENCY" value={run.latencyMs !== null ? `${run.latencyMs}ms` : "…"} />
    </div>
  );
}

function Row({ label, value, valueClassName }: { label: string; value: string; valueClassName?: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span>{label}</span>
      <span className={cn("truncate text-text-primary", valueClassName)}>{value}</span>
    </div>
  );
}
