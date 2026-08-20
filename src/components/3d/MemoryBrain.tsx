"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

interface MemoryBrainProps {
  color?: string;
  secondaryColor?: string;
  activity?: number; // 0..1, drives synapse twinkle rate
}

/** Stylized holographic neural-brain mesh: a squashed wireframe icosphere
 * with glowing "synapse" points at a subset of vertices and slow rotation.
 * Not anatomically literal — an original HUD-style abstraction of the
 * reference art's neural brain visualization. */
export function MemoryBrain({ color = "#22d3ee", secondaryColor = "#8b5cf6", activity = 0.6 }: MemoryBrainProps) {
  const groupRef = useRef<THREE.Group>(null);
  const synapseRef = useRef<THREE.Points>(null);

  const geometry = useMemo(() => {
    const geo = new THREE.IcosahedronGeometry(1.35, 3);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      // Squash vertically + widen laterally for a brain-like silhouette,
      // with a gentle central groove to suggest hemispheres.
      const groove = Math.exp(-(x * x) / 0.05) * 0.12;
      pos.setXYZ(i, x * 1.15, y * 0.82 - groove, z * 0.95);
    }
    geo.computeVertexNormals();
    return geo;
  }, []);

  const synapsePositions = useMemo(() => {
    const pos = geometry.attributes.position;
    const count = Math.floor(pos.count * 0.35);
    const arr = new Float32Array(count * 3);
    const step = Math.max(1, Math.floor(pos.count / count));
    let write = 0;
    for (let i = 0; i < pos.count && write < count; i += step) {
      arr[write * 3] = pos.getX(i);
      arr[write * 3 + 1] = pos.getY(i);
      arr[write * 3 + 2] = pos.getZ(i);
      write++;
    }
    return arr.slice(0, write * 3);
  }, [geometry]);

  useFrame((state, delta) => {
    if (document.hidden) return;
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.12;
    }
    if (synapseRef.current) {
      const mat = synapseRef.current.material as THREE.PointsMaterial;
      const t = state.clock.elapsedTime;
      mat.opacity = 0.5 + Math.sin(t * (1.5 + activity * 2)) * 0.35;
    }
  });

  return (
    <group ref={groupRef}>
      <mesh geometry={geometry}>
        <meshBasicMaterial color={color} wireframe transparent opacity={0.4} />
      </mesh>
      <mesh geometry={geometry} scale={1.002}>
        <meshBasicMaterial
          color={secondaryColor}
          transparent
          opacity={0.06}
          blending={THREE.AdditiveBlending}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
      <points ref={synapseRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[synapsePositions, 3]} />
        </bufferGeometry>
        <pointsMaterial
          color="#eafcff"
          size={0.035}
          sizeAttenuation
          transparent
          opacity={0.7}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </points>
    </group>
  );
}
