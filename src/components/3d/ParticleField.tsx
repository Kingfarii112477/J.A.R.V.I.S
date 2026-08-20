"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

interface ParticleFieldProps {
  count?: number;
  radius?: number;
  color?: string;
  speed?: number;
}

function shellPositions(count: number, radius: number) {
  const positions = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const r = radius * (0.55 + Math.random() * 0.6);
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = r * Math.cos(phi);
    seeds[i] = Math.random();
  }
  return { positions, seeds };
}

/** Slowly drifting particle shell surrounding the core, plus a sparser,
 * farther, dimmer "far" shell rotating independently — the parallax
 * between the two layers reads as depth rather than a single flat cloud.
 * Both use a single THREE.Points draw call each so cost stays predictable
 * on mobile (the far layer is a quarter of `count`). */
export function ParticleField({ count = 600, radius = 2.4, color = "#67e8f9", speed = 1 }: ParticleFieldProps) {
  const pointsRef = useRef<THREE.Points>(null);
  const groupRef = useRef<THREE.Group>(null);
  const farPointsRef = useRef<THREE.Points>(null);
  const farGroupRef = useRef<THREE.Group>(null);

  const { positions, seeds } = useMemo(() => shellPositions(count, radius), [count, radius]);
  const farCount = Math.max(40, Math.round(count * 0.25));
  const { positions: farPositions, seeds: farSeeds } = useMemo(
    () => shellPositions(farCount, radius * 1.9),
    [farCount, radius],
  );

  useFrame((_, delta) => {
    if (document.hidden) return;
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.05 * speed;
      groupRef.current.rotation.x += delta * 0.015 * speed;
    }
    if (pointsRef.current) {
      const material = pointsRef.current.material as THREE.PointsMaterial;
      const t = performance.now() * 0.001;
      material.opacity = 0.55 + Math.sin(t * 1.4) * 0.15;
    }
    if (farGroupRef.current) {
      farGroupRef.current.rotation.y -= delta * 0.018 * speed;
      farGroupRef.current.rotation.z += delta * 0.009 * speed;
    }
    if (farPointsRef.current) {
      const material = farPointsRef.current.material as THREE.PointsMaterial;
      const t = performance.now() * 0.001;
      material.opacity = 0.18 + Math.sin(t * 0.9 + 1.3) * 0.08;
    }
  });

  return (
    <>
      <group ref={groupRef}>
        <points ref={pointsRef}>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" args={[positions, 3]} />
            <bufferAttribute attach="attributes-aSeed" args={[seeds, 1]} />
          </bufferGeometry>
          <pointsMaterial
            color={color}
            size={0.028}
            sizeAttenuation
            transparent
            opacity={0.6}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </points>
      </group>
      <group ref={farGroupRef}>
        <points ref={farPointsRef}>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" args={[farPositions, 3]} />
            <bufferAttribute attach="attributes-aSeed" args={[farSeeds, 1]} />
          </bufferGeometry>
          <pointsMaterial
            color={color}
            size={0.016}
            sizeAttenuation
            transparent
            opacity={0.2}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </points>
      </group>
    </>
  );
}
