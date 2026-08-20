"use client";

import { cn } from "@/lib/utils/cn";

interface AnimatedGaugeProps {
  value: number; // 0..100
  label?: string;
  sublabel?: string;
  color?: string;
  size?: number;
  className?: string;
}

export function AnimatedGauge({ value, label, sublabel, color = "#22d3ee", size = 220, className }: AnimatedGaugeProps) {
  const stroke = size * 0.045;
  const radius = size / 2 - stroke;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, value));
  const offset = circumference * (1 - clamped / 100);

  return (
    <div className={cn("relative inline-flex items-center justify-center", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgba(103,232,249,0.12)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.6s ease-out", filter: `drop-shadow(0 0 8px ${color})` }}
        />
      </svg>
      <div className="absolute flex flex-col items-center justify-center text-center">
        {label && <span className="font-display text-4xl text-text-primary">{label}</span>}
        {sublabel && <span className="font-technical mt-1 text-xs tracking-[0.2em] text-success">{sublabel}</span>}
      </div>
    </div>
  );
}
