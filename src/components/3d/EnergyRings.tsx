"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

interface EnergyRingsProps {
  radius?: number;
  color?: string;
  secondaryColor?: string;
  intensity?: number;
  ringCount?: number;
}

interface RingSpec {
  tilt: [number, number, number];
  speed: number;
  color: string;
  opacity: number;
}

/** A gyroscope-like cluster of tilted rings around a shared radius, plus
 * radial "spoke" lines through the center — the wireframe-globe look from
 * the reference core art, built from primitives instead of an image. */
export function EnergyRings({
  radius = 1.6,
  color = "#22d3ee",
  secondaryColor = "#8b5cf6",
  intensity = 1,
  ringCount = 7,
}: EnergyRingsProps) {
  const groupRef = useRef<THREE.Group>(null);

  const rings: RingSpec[] = useMemo(() => {
    const specs: RingSpec[] = [];
    for (let i = 0; i < ringCount; i++) {
      const t = i / Math.max(1, ringCount - 1);
      specs.push({
        tilt: [
          (Math.random() - 0.5) * Math.PI,
          (Math.random() - 0.5) * Math.PI,
          (Math.random() - 0.5) * Math.PI,
        ],
        speed: 0.06 + Math.random() * 0.14 * (i % 2 === 0 ? 1 : -1),
        color: t < 0.5 ? color : secondaryColor,
        opacity: 0.18 + Math.random() * 0.22,
      });
    }
    return specs;
  }, [ringCount, color, secondaryColor]);

  const spokeDirections = useMemo(() => {
    const dirs: [number, number, number][] = [];
    const spokeCount = 10;
    for (let i = 0; i < spokeCount; i++) {
      const theta = (i / spokeCount) * Math.PI * 2;
      dirs.push([Math.cos(theta), (Math.random() - 0.5) * 0.3, Math.sin(theta)]);
    }
    return dirs;
  }, []);

  const ringRefs = useRef<(THREE.Mesh | null)[]>([]);

  useFrame((_, delta) => {
    if (document.hidden) return;
    ringRefs.current.forEach((mesh, i) => {
      if (!mesh) return;
      mesh.rotation.z += delta * rings[i].speed * intensity;
    });
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.04 * intensity;
    }
  });

  return (
    <group ref={groupRef}>
      {rings.map((ring, i) => (
        <mesh key={i} ref={(el) => { ringRefs.current[i] = el; }} rotation={ring.tilt}>
          <torusGeometry args={[radius, radius * 0.006, 8, 96]} />
          <meshBasicMaterial
            color={ring.color}
            transparent
            opacity={ring.opacity}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
      ))}

      {/* Outer rim ring — the brightest, most defined edge of the sphere */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[radius, radius * 0.01, 8, 128]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.5}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {spokeDirections.map((dir, i) => (
        <line key={i}>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              args={[
                new Float32Array([
                  0, 0, 0,
                  dir[0] * radius * 1.06,
                  dir[1] * radius * 1.06,
                  dir[2] * radius * 1.06,
                ]),
                3,
              ]}
            />
          </bufferGeometry>
          <lineBasicMaterial color={color} transparent opacity={0.22} />
        </line>
      ))}
    </group>
  );
}
