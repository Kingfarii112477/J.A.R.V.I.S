"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

interface HologramProps {
  color?: string;
  secondaryColor?: string;
  y?: number;
  radius?: number;
}

/** The holographic projection base beneath the core — concentric floor
 * rings plus a vertical light beam — shared by the dashboard core and the
 * memory core brain to keep the "same product family" feel across screens. */
export function Hologram({ color = "#22d3ee", secondaryColor = "#8b5cf6", y = -1.7, radius = 1.4 }: HologramProps) {
  const groupRef = useRef<THREE.Group>(null);
  const rings = useMemo(
    () => [
      { r: radius * 0.4, speed: 0.25, opacity: 0.5 },
      { r: radius * 0.62, speed: -0.18, opacity: 0.4 },
      { r: radius * 0.84, speed: 0.12, opacity: 0.32 },
      { r: radius * 1.05, speed: -0.08, opacity: 0.24 },
      { r: radius * 1.25, speed: 0.06, opacity: 0.16 },
    ],
    [radius]
  );
  const ringRefs = useRef<(THREE.Mesh | null)[]>([]);

  useFrame((_, delta) => {
    if (document.hidden) return;
    ringRefs.current.forEach((mesh, i) => {
      if (!mesh) return;
      mesh.rotation.z += delta * rings[i].speed;
    });
  });

  return (
    <group ref={groupRef} position={[0, y, 0]}>
      {rings.map((ring, i) => (
        <mesh key={i} ref={(el) => { ringRefs.current[i] = el; }} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[ring.r, ring.r + radius * 0.012, 96]} />
          <meshBasicMaterial
            color={i % 2 === 0 ? color : secondaryColor}
            transparent
            opacity={ring.opacity}
            blending={THREE.AdditiveBlending}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
      ))}

      {/* Vertical light beam connecting core to pedestal */}
      <mesh position={[0, Math.abs(y) / 2, 0]}>
        <cylinderGeometry args={[0.01, 0.01, Math.abs(y) * 2.4, 8]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.35}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}
