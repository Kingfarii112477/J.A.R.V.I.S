"use client";

interface SparklineProps {
  data: number[];
  color?: string;
  height?: number;
  variant?: "line" | "bars";
}

/** Lightweight inline SVG sparkline — no charting library dependency. */
export function Sparkline({ data, color = "#22d3ee", height = 36, variant = "line" }: SparklineProps) {
  if (data.length < 2) return <div style={{ height }} />;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const width = 100;

  if (variant === "bars") {
    const barWidth = width / data.length;
    return (
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" width="100%" height={height}>
        {data.map((v, i) => {
          const h = ((v - min) / range) * (height - 2) + 2;
          return (
            <rect
              key={i}
              x={i * barWidth + barWidth * 0.15}
              y={height - h}
              width={barWidth * 0.7}
              height={h}
              fill={color}
              opacity={0.35 + (i / data.length) * 0.55}
              rx={0.6}
            />
          );
        })}
      </svg>
    );
  }

  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * width;
      const y = height - ((v - min) / range) * (height - 4) - 2;
      return `${x},${y}`;
    })
    .join(" ");

  const areaPoints = `0,${height} ${points} ${width},${height}`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" width="100%" height={height}>
      <polygon points={areaPoints} fill={color} opacity={0.12} />
      <polyline points={points} fill="none" stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
