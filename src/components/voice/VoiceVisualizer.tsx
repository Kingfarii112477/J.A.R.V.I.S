"use client";

interface VoiceVisualizerProps {
  levels: number[];
  active: boolean;
}

export function VoiceVisualizer({ levels, active }: VoiceVisualizerProps) {
  const mid = Math.floor(levels.length / 2);
  const left = levels.slice(0, mid).reverse();
  const right = levels.slice(mid);

  return (
    <div className="flex h-16 w-full items-center justify-center gap-0.5 px-4">
      {[...left, ...right].map((level, i) => {
        const isLeft = i < left.length;
        const height = active ? Math.max(6, level * 60) : 6;
        return (
          <span
            key={i}
            className="w-1 rounded-full transition-[height] duration-100 ease-out"
            style={{
              height,
              background: isLeft ? "#3b82f6" : "#8b5cf6",
              opacity: active ? 0.55 + level * 0.45 : 0.25,
              boxShadow: active && level > 0.4 ? `0 0 8px ${isLeft ? "#3b82f6" : "#8b5cf6"}` : undefined,
            }}
          />
        );
      })}
    </div>
  );
}
