"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

interface NeuralCoreProps {
  color?: string;
  pulseSpeed?: number;
  pulseStrength?: number;
  size?: number;
}

/** The glowing central sphere at the heart of the core — a bright inner
 * point plus a soft additive halo. Breathing scale + brightness react to
 * jarvis state via pulseSpeed/pulseStrength passed down from JarvisCore. */
export function NeuralCore({ color = "#e6fbff", pulseSpeed = 1, pulseStrength = 0.08, size = 0.22 }: NeuralCoreProps) {
  const coreRef = useRef<THREE.Mesh>(null);
  const haloRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (document.hidden) return;
    const t = state.clock.elapsedTime;
    const pulse = 1 + Math.sin(t * pulseSpeed * 1.6) * pulseStrength;
    if (coreRef.current) {
      coreRef.current.scale.setScalar(pulse);
    }
    if (haloRef.current) {
      haloRef.current.scale.setScalar(pulse * 1.35);
      const mat = haloRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.35 + Math.sin(t * pulseSpeed * 1.6) * 0.12;
    }
  });

  return (
    <group>
      <mesh ref={coreRef}>
        <sphereGeometry args={[size, 32, 32]} />
        <meshBasicMaterial color={color} toneMapped={false} />
      </mesh>
      <mesh ref={haloRef}>
        <sphereGeometry args={[size * 1.8, 24, 24]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.35}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
      <mesh>
        <sphereGeometry args={[size * 3.2, 16, 16]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.08}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}
