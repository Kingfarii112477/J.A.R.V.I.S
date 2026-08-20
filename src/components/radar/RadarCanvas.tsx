"use client";

import { useEffect, useRef } from "react";
import type { RadarTarget } from "@/types/jarvis";
import { spawnTarget, driftTarget, classificationColor, polarToXY } from "@/lib/radar/simulate";

interface RadarCanvasProps {
  onStatsChange?: (targets: RadarTarget[]) => void;
  maxTargets?: number;
}

const SWEEP_DEGREES_PER_SEC = 45;
const RING_COUNT = 4;

export function RadarCanvas({ onStatsChange, maxTargets = 9 }: RadarCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const targetsRef = useRef<RadarTarget[]>([]);
  const sweepRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const lastFrameRef = useRef(0);
  const lastSpawnRef = useRef(0);
  const lastStatsRef = useRef(0);
  const onStatsChangeRef = useRef(onStatsChange);
  useEffect(() => {
    onStatsChangeRef.current = onStatsChange;
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const context2d = canvas.getContext("2d");
    if (!context2d) return;
    const ctx: CanvasRenderingContext2D = context2d;

    let width = 0;
    let height = 0;

    function resize() {
      if (!canvas || !container) return;
      const size = Math.min(container.clientWidth, container.clientHeight || container.clientWidth);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = size;
      height = size;
      canvas.width = size * dpr;
      canvas.height = size * dpr;
      canvas.style.width = `${size}px`;
      canvas.style.height = `${size}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
    resize();

    // Seed a few targets immediately so the screen isn't empty on load.
    targetsRef.current = Array.from({ length: 5 }, () => spawnTarget());
    lastFrameRef.current = performance.now();

    function draw(now: number) {
      const dt = Math.min((now - lastFrameRef.current) / 1000, 0.1);
      lastFrameRef.current = now;

      if (document.hidden) {
        rafRef.current = requestAnimationFrame(draw);
        return;
      }

      sweepRef.current = (sweepRef.current + SWEEP_DEGREES_PER_SEC * dt) % 360;

      targetsRef.current = targetsRef.current
        .map((t) => driftTarget(t, dt))
        .filter((t) => now < t.fadeAt || now < t.fadeAt + 800);

      if (now - lastSpawnRef.current > 1800 && targetsRef.current.length < maxTargets && Math.random() < 0.5) {
        lastSpawnRef.current = now;
        targetsRef.current = [...targetsRef.current, spawnTarget()];
      }

      if (now - lastStatsRef.current > 400) {
        lastStatsRef.current = now;
        onStatsChangeRef.current?.(targetsRef.current);
      }

      renderFrame(ctx, width, height, sweepRef.current, targetsRef.current, now);
      rafRef.current = requestAnimationFrame(draw);
    }

    rafRef.current = requestAnimationFrame(draw);

    return () => {
      resizeObserver.disconnect();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [maxTargets]);

  return (
    <div ref={containerRef} className="relative aspect-square w-full">
      <canvas ref={canvasRef} className="absolute inset-0" />
    </div>
  );
}

function renderFrame(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  sweepDeg: number,
  targets: RadarTarget[],
  now: number
) {
  const cx = width / 2;
  const cy = height / 2;
  const radius = width / 2 - 18;

  ctx.clearRect(0, 0, width, height);

  // Sweep gradient wedge
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(((sweepDeg - 90) * Math.PI) / 180);
  const sweepGradient = ctx.createConicGradient(0, 0, 0);
  sweepGradient.addColorStop(0, "rgba(255,85,0,0.32)");
  sweepGradient.addColorStop(0.06, "rgba(255,85,0,0.12)");
  sweepGradient.addColorStop(0.14, "rgba(255,85,0,0)");
  sweepGradient.addColorStop(1, "rgba(255,85,0,0)");
  ctx.fillStyle = sweepGradient;
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Concentric rings
  ctx.strokeStyle = "rgba(255,140,60,0.28)";
  ctx.lineWidth = 1;
  for (let i = 1; i <= RING_COUNT; i++) {
    ctx.beginPath();
    ctx.arc(cx, cy, (radius / RING_COUNT) * i, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Crosshair + degree spokes
  ctx.strokeStyle = "rgba(255,140,60,0.18)";
  for (let deg = 0; deg < 360; deg += 30) {
    const rad = (deg * Math.PI) / 180;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(rad) * radius, cy + Math.sin(rad) * radius);
    ctx.stroke();
  }

  // Outer rim, gradient cyan -> violet like the reference
  const rimGradient = ctx.createLinearGradient(cx - radius, cy - radius, cx + radius, cy + radius);
  rimGradient.addColorStop(0, "#22d3ee");
  rimGradient.addColorStop(1, "#8b5cf6");
  ctx.strokeStyle = rimGradient;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.stroke();

  // Degree labels
  ctx.fillStyle = "rgba(255,170,90,0.75)";
  ctx.font = "10px var(--font-jetbrains), monospace";
  ctx.textAlign = "center";
  ctx.fillText("0", cx, cy - radius - 6);
  ctx.fillText("90", cx + radius + 14, cy + 3);
  ctx.fillText("180", cx, cy + radius + 16);
  ctx.fillText("270", cx - radius - 16, cy + 3);

  // Center hub
  ctx.fillStyle = "#fff7ec";
  ctx.beginPath();
  ctx.arc(cx, cy, 3.5, 0, Math.PI * 2);
  ctx.fill();

  // Targets
  for (const target of targets) {
    const { x, y } = polarToXY(target.angleDeg, target.distance, radius);
    const px = cx + x;
    const py = cy + y;
    const age = now - target.createdAt;
    const timeLeft = target.fadeAt - now;
    const fadeIn = Math.min(1, age / 400);
    const fadeOut = Math.min(1, Math.max(0, timeLeft / 600));
    const alpha = Math.min(fadeIn, fadeOut === 0 && timeLeft > 600 ? 1 : fadeOut);
    const color = classificationColor(target.classification);

    ctx.save();
    ctx.globalAlpha = Math.max(0, alpha);
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 1.5;

    const size = 8;
    ctx.strokeRect(px - size, py - size, size * 2, size * 2);
    ctx.beginPath();
    ctx.arc(px, py, 2.5, 0, Math.PI * 2);
    ctx.fill();

    if (target.classification === "THREAT") {
      ctx.beginPath();
      ctx.arc(px, py, size + 4 + Math.sin(now / 200) * 2, 0, Math.PI * 2);
      ctx.globalAlpha = Math.max(0, alpha * 0.4);
      ctx.stroke();
    }
    ctx.restore();
  }
}
