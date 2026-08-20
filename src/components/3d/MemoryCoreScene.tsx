"use client";

import { Suspense, useEffect, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import { MemoryBrain } from "./MemoryBrain";
import { Hologram } from "./Hologram";
import { SceneLighting } from "./SceneLighting";
import { CoreFallback } from "./CoreFallback";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";
import { isWebGLAvailable } from "@/lib/utils/webgl";
import { qualityPresets, type GraphicsQuality } from "@/config/theme";

interface MemoryCoreSceneProps {
  activity?: number;
  quality?: GraphicsQuality;
  className?: string;
}

export function MemoryCoreScene({ activity = 0.6, quality = "high", className }: MemoryCoreSceneProps) {
  const [webglOk, setWebglOk] = useState(true);
  useEffect(() => setWebglOk(isWebGLAvailable()), []);

  const preset = qualityPresets[quality];

  if (!webglOk) {
    return (
      <div className={className}>
        <CoreFallback color="#8b5cf6" label="3D ACCELERATION UNAVAILABLE" />
      </div>
    );
  }

  return (
    <div className={className}>
      <ErrorBoundary fallback={<CoreFallback color="#8b5cf6" />}>
        <Canvas dpr={preset.dpr} gl={{ antialias: false, alpha: true }} camera={{ position: [0, 0.3, 4.6], fov: 42 }}>
          <Suspense fallback={null}>
            <SceneLighting color="#8b5cf6" />
            <MemoryBrain activity={activity} />
            <Hologram color="#22d3ee" secondaryColor="#8b5cf6" y={-1.7} radius={1.2} />
            {preset.bloom && (
              <EffectComposer multisampling={0}>
                <Bloom intensity={0.7} luminanceThreshold={0.2} luminanceSmoothing={0.4} mipmapBlur />
              </EffectComposer>
            )}
          </Suspense>
        </Canvas>
      </ErrorBoundary>
    </div>
  );
}
