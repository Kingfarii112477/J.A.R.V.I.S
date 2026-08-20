"use client";

interface SceneLightingProps {
  color?: string;
  intensity?: number;
}

export function SceneLighting({ color = "#22d3ee", intensity = 1.4 }: SceneLightingProps) {
  return (
    <>
      <ambientLight intensity={0.35} color="#3b82f6" />
      <pointLight position={[0, 0, 0]} color={color} intensity={intensity} distance={8} decay={2} />
      <pointLight position={[2, 3, 2]} color="#8b5cf6" intensity={0.4} distance={10} decay={2} />
    </>
  );
}
