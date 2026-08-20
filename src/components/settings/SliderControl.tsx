"use client";

interface SliderControlProps {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  ariaLabel: string;
}

export function SliderControl({ value, min, max, step = 1, onChange, ariaLabel }: SliderControlProps) {
  const percent = ((value - min) / (max - min)) * 100;
  return (
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      aria-label={ariaLabel}
      className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-panel-strong accent-cyan"
      style={{
        background: `linear-gradient(to right, #22d3ee 0%, #22d3ee ${percent}%, rgba(103,232,249,0.12) ${percent}%, rgba(103,232,249,0.12) 100%)`,
      }}
    />
  );
}
