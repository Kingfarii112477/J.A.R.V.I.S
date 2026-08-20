import { cn } from "@/lib/utils/cn";

export type DataSourceStatus = "connected" | "simulated" | "not-connected" | "unavailable";

const STYLES: Record<DataSourceStatus, string> = {
  connected: "border-success/30 bg-success/10 text-success",
  simulated: "border-warning/30 bg-warning/10 text-warning",
  "not-connected": "border-text-muted/30 bg-transparent text-text-muted",
  unavailable: "border-text-muted/30 bg-transparent text-text-muted",
};

const TEXT: Record<DataSourceStatus, string> = {
  connected: "CONNECTED",
  simulated: "SIMULATED",
  "not-connected": "NOT CONNECTED",
  unavailable: "UNAVAILABLE",
};

interface DataSourceBadgeProps {
  label: string;
  status: DataSourceStatus;
  /** Optional extra detail appended to the status text, e.g. a provider
   * name — "CONNECTED — Tavily Search" instead of a bare "CONNECTED". */
  detail?: string;
  className?: string;
}

/**
 * A small, consistent "is this real or simulated" indicator used across
 * screens so nothing pretends to be live external data when it isn't —
 * see the product's real-vs-simulated data design principle. Never render
 * "connected" unless a real check actually confirmed it.
 */
export function DataSourceBadge({ label, status, detail, className }: DataSourceBadgeProps) {
  return (
    <div className={cn("flex items-center justify-between gap-2 rounded-lg bg-panel-strong px-3 py-2", className)}>
      <span className="font-technical text-[10px] tracking-[0.12em] text-text-secondary">{label}</span>
      <span className={cn("font-technical rounded-full border px-2 py-0.5 text-[9px] tracking-[0.1em]", STYLES[status])}>
        {TEXT[status]}
        {detail ? ` — ${detail}` : ""}
      </span>
    </div>
  );
}
