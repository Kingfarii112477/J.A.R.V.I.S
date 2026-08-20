"use client";

const MARKERS = [
  { id: "na", x: 20, y: 34 },
  { id: "sa", x: 31, y: 66 },
  { id: "eu", x: 50, y: 30 },
  { id: "af", x: 52, y: 58 },
  { id: "as", x: 72, y: 36 },
  { id: "au", x: 82, y: 74 },
];

/** Stylized global signal map — a dotted world texture with a handful of
 * pulsing tracking markers. Not a literal geographic dataset; an original
 * HUD-style abstraction consistent with the rest of the interface. */
export function GlobalMap() {
  return (
    <div
      className="relative aspect-[16/10] w-full overflow-hidden rounded-lg border border-orange/20"
      style={{
        backgroundImage: "radial-gradient(rgba(103,232,249,0.35) 1px, transparent 1px)",
        backgroundSize: "10px 10px",
        backgroundColor: "rgba(10,6,2,0.4)",
      }}
    >
      <div className="hud-corner absolute inset-2" />
      {MARKERS.map((m) => (
        <span
          key={m.id}
          className="absolute flex h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2"
          style={{ left: `${m.x}%`, top: `${m.y}%` }}
        >
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-orange opacity-60" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-orange shadow-[0_0_8px_2px_rgba(255,85,0,0.8)]" />
        </span>
      ))}
    </div>
  );
}
