"use client";

import { HudPanel } from "./HudPanel";
import { Sparkline } from "./Sparkline";
import { useMetricHistory } from "@/hooks/useMetricHistory";
import { cn } from "@/lib/utils/cn";

interface MetricCardProps {
  label: string;
  value: number;
  unit?: string;
  color?: string;
  sparklineVariant?: "line" | "bars";
  className?: string;
}

export function MetricCard({ label, value, unit = "%", color = "#22d3ee", sparklineVariant = "line", className }: MetricCardProps) {
  const history = useMetricHistory(value);

  return (
    <HudPanel className={cn("flex flex-col gap-2", className)}>
      <span className="font-technical text-[10px] tracking-[0.16em] text-text-secondary">{label}</span>
      <span className="font-display text-2xl text-text-primary">
        {Math.round(value)}
        <span className="text-sm text-text-secondary">{unit}</span>
      </span>
      <Sparkline data={history} color={color} variant={sparklineVariant} />
    </HudPanel>
  );
}
