import { cn } from "@/lib/utils/cn";

interface CoreAvatarProps {
  size?: number;
  className?: string;
  active?: boolean;
}

/** Lightweight CSS stand-in for the 3D core, used anywhere a full Three.js
 * canvas per instance would be wasteful (chat message avatars, lists). */
export function CoreAvatar({ size = 32, className, active = false }: CoreAvatarProps) {
  return (
    <div
      className={cn("relative shrink-0 rounded-full border border-cyan/40", className, active && "animate-pulse-slow")}
      style={{
        width: size,
        height: size,
        background: "radial-gradient(circle at 50% 45%, #eafcff 0%, #22d3ee 35%, #1d4ed8 75%, #0a1120 100%)",
        boxShadow: "0 0 10px rgba(34,211,238,0.5), inset 0 0 6px rgba(0,0,0,0.4)",
      }}
    >
      <div className="absolute inset-[15%] rounded-full border border-white/30" />
      <div className="absolute inset-[30%] rounded-full border border-white/20" />
    </div>
  );
}
