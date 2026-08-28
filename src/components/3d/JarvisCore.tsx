"use client";

import { Suspense, useMemo, useState, useEffect } from "react";
import { Canvas } from "@react-three/fiber";
import { EffectComposer, Bloom, Vignette } from "@react-three/postprocessing";
import type { JarvisState } from "@/types/jarvis";
import { coreStateColor, qualityPresets, type GraphicsQuality } from "@/config/theme";
import { useJarvisStore } from "@/store/jarvisStore";
import { NeuralCore } from "./NeuralCore";
import { EnergyRings } from "./EnergyRings";
import { ParticleField } from "./ParticleField";
import { Hologram } from "./Hologram";
import { SceneLighting } from "./SceneLighting";
import { CoreFallback } from "./CoreFallback";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";
import { isWebGLAvailable } from "@/lib/utils/webgl";

interface JarvisCoreProps {
  state: JarvisState;
  quality?: GraphicsQuality;
  showHologramBase?: boolean;
  onClick?: () => void;
  className?: string;
}

const speedByState: Partial<Record<JarvisState, number>> = {
  BOOTING: 0.8,
  IDLE: 1,
  LISTENING: 1.3,
  THINKING: 2.1,
  SPEAKING: 1.7,
  PROCESSING: 1.9,
  DIAGNOSTICS: 1.5,
  WARNING: 2.4,
  ERROR: 0.5,
  OFFLINE: 0.12,
};

const pulseByState: Partial<Record<JarvisState, number>> = {
  WARNING: 0.22,
  ERROR: 0.18,
  SPEAKING: 0.16,
  THINKING: 0.12,
};

export function JarvisCore({
  state,
  quality = "high",
  showHologramBase = true,
  onClick,
  className,
}: JarvisCoreProps) {
  const [webglOk, setWebglOk] = useState(true);
  const reducedMotion = useJarvisStore((s) => s.settings.reducedMotion);
  const activeToolCalls = useJarvisStore((s) => s.activeToolCalls);

  useEffect(() => {
    setWebglOk(isWebGLAvailable());
  }, []);

  const color = coreStateColor[state] ?? coreStateColor.IDLE;
  const preset = qualityPresets[quality];
  const speed = reducedMotion ? Math.min(0.25, speedByState[state] ?? 1) : speedByState[state] ?? 1;
  const pulse = reducedMotion ? 0.02 : pulseByState[state] ?? 0.08;
  // Reasoning executing more than one tool at once (parallel tool calls)
  // reads as visibly busier particle motion — capped so it stays a subtle
  // cue rather than a distracting speed-up.
  const particleSpeed = reducedMotion ? speed : speed * (1 + Math.min(activeToolCalls, 3) * 0.15);

  const secondaryColor = state === "WARNING" || state === "ERROR" ? "#ff8a4c" : "#8b5cf6";

  const dpr = useMemo<[number, number]>(() => preset.dpr, [preset]);

  if (!webglOk) {
    return (
      <div className={className}>
        <CoreFallback color={color} />
      </div>
    );
  }

  return (
    <div className={className} onClick={onClick} role={onClick ? "button" : undefined} tabIndex={onClick ? 0 : undefined}>
      <ErrorBoundary fallback={<CoreFallback color={color} />}>
        <Canvas
          dpr={dpr}
          gl={{ antialias: false, alpha: true, powerPreference: "high-performance" }}
          camera={{ position: [0, 0.15, 4.2], fov: 42 }}
        >
          <Suspense fallback={null}>
            <SceneLighting color={color} />
            <group scale={1.05}>
              <NeuralCore color="#f2fdff" pulseSpeed={speed} pulseStrength={pulse} />
              <EnergyRings color={color} secondaryColor={secondaryColor} intensity={speed} radius={1.55} />
              <ParticleField
                count={preset.particleCount}
                color={color}
                radius={2.3}
                speed={particleSpeed}
              />
              {showHologramBase && (
                <Hologram color={color} secondaryColor={secondaryColor} y={-1.55} radius={1.3} />
              )}
            </group>
            {preset.bloom && (
              <EffectComposer multisampling={0}>
                <Bloom
                  intensity={0.7}
                  luminanceThreshold={0.2}
                  luminanceSmoothing={0.5}
                  levels={8}
                  mipmapBlur
                />
                <Vignette eskil={false} offset={0.25} darkness={0.55} />
              </EffectComposer>
            )}
          </Suspense>
        </Canvas>
      </ErrorBoundary>
    </div>
  );
}
