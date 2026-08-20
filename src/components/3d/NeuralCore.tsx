"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Billboard } from "@react-three/drei";
import * as THREE from "three";

interface NeuralCoreProps {
  color?: string;
  pulseSpeed?: number;
  pulseStrength?: number;
  size?: number;
}

const glowVertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Radial falloff sprite, camera-facing via Billboard — this is what turns
// the core from a hard-edged sphere silhouette into a genuinely soft,
// diffuse glow. `uSharpness` controls how tight the hot center is; the
// glow is squared for a more physically-plausible energy falloff than a
// flat smoothstep gives.
const glowFragmentShader = /* glsl */ `
  varying vec2 vUv;
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uSharpness;
  void main() {
    vec2 centered = vUv - 0.5;
    float dist = length(centered) * 2.0;
    float falloff = clamp(1.0 - dist, 0.0, 1.0);
    float glow = pow(falloff, uSharpness);
    gl_FragColor = vec4(uColor, glow * uOpacity);
  }
`;

/** The glowing central sphere at the heart of the core — a bright inner
 * point plus soft, camera-facing radial-gradient glow layers (not flat-
 * opacity spheres, which read as hard-edged balls from any angle).
 * Breathing scale + brightness react to jarvis state via
 * pulseSpeed/pulseStrength passed down from JarvisCore. */
export function NeuralCore({ color = "#e6fbff", pulseSpeed = 1, pulseStrength = 0.08, size = 0.22 }: NeuralCoreProps) {
  const coreRef = useRef<THREE.Mesh>(null);
  const innerGlowRef = useRef<THREE.ShaderMaterial>(null);
  const outerGlowRef = useRef<THREE.ShaderMaterial>(null);
  const innerGroupRef = useRef<THREE.Group>(null);
  const outerGroupRef = useRef<THREE.Group>(null);

  const colorVec = useMemo(() => new THREE.Color(color), [color]);

  useFrame((state) => {
    if (document.hidden) return;
    const t = state.clock.elapsedTime;
    const pulse = 1 + Math.sin(t * pulseSpeed * 1.6) * pulseStrength;
    const breathe = 0.5 + Math.sin(t * pulseSpeed * 1.6) * 0.5;

    if (coreRef.current) coreRef.current.scale.setScalar(pulse);
    if (innerGroupRef.current) innerGroupRef.current.scale.setScalar(pulse * 1.6);
    if (outerGroupRef.current) outerGroupRef.current.scale.setScalar(pulse * 1.15);
    if (innerGlowRef.current) innerGlowRef.current.uniforms.uOpacity.value = 0.75 + breathe * 0.2;
    if (outerGlowRef.current) outerGlowRef.current.uniforms.uOpacity.value = 0.22 + breathe * 0.12;
  });

  return (
    <group>
      <mesh ref={coreRef}>
        <sphereGeometry args={[size, 32, 32]} />
        <meshBasicMaterial color={color} toneMapped={false} />
      </mesh>

      <group ref={innerGroupRef}>
        <Billboard>
          <mesh scale={size * 3.4}>
            <planeGeometry args={[1, 1]} />
            <shaderMaterial
              ref={innerGlowRef}
              vertexShader={glowVertexShader}
              fragmentShader={glowFragmentShader}
              uniforms={{
                uColor: { value: colorVec },
                uOpacity: { value: 0.8 },
                uSharpness: { value: 2.2 },
              }}
              transparent
              depthWrite={false}
              blending={THREE.AdditiveBlending}
            />
          </mesh>
        </Billboard>
      </group>

      <group ref={outerGroupRef}>
        <Billboard>
          <mesh scale={size * 9}>
            <planeGeometry args={[1, 1]} />
            <shaderMaterial
              ref={outerGlowRef}
              vertexShader={glowVertexShader}
              fragmentShader={glowFragmentShader}
              uniforms={{
                uColor: { value: colorVec },
                uOpacity: { value: 0.28 },
                uSharpness: { value: 1.4 },
              }}
              transparent
              depthWrite={false}
              blending={THREE.AdditiveBlending}
            />
          </mesh>
        </Billboard>
      </group>
    </group>
  );
}
