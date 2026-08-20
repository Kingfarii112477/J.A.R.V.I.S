/**
 * JS-side mirror of the CSS design tokens in globals.css.
 * Needed anywhere raw hex values are required (Three.js materials, canvas
 * radar rendering, chart fills) where CSS custom properties can't be used
 * directly.
 */
export const palette = {
  void: "#020409",
  bg: "#04070f",
  bgElevated: "#070c1a",
  panel: "#0a1120",
  panelStrong: "#0d1626",

  cyan: "#22d3ee",
  cyanSoft: "#67e8f9",
  cyanDim: "#0e7490",
  blue: "#3b82f6",
  blueDeep: "#1d4ed8",
  violet: "#8b5cf6",
  violetDeep: "#6d28d9",
  magenta: "#d946ef",
  orange: "#ff5500",
  orangeSoft: "#ff8a4c",
  success: "#34d399",
  warning: "#f5b942",
  danger: "#ef4444",

  textPrimary: "#eaf3ff",
  textSecondary: "#8fa5c4",
  textMuted: "#526180",
} as const;

export type GraphicsQuality = "low" | "balanced" | "high" | "ultra";

export const qualityPresets: Record<
  GraphicsQuality,
  {
    particleCount: number;
    dpr: [number, number];
    bloom: boolean;
    shadows: boolean;
  }
> = {
  low: { particleCount: 200, dpr: [1, 1], bloom: false, shadows: false },
  balanced: { particleCount: 600, dpr: [1, 1.5], bloom: true, shadows: false },
  high: { particleCount: 1200, dpr: [1, 2], bloom: true, shadows: false },
  ultra: { particleCount: 2400, dpr: [1, 2], bloom: true, shadows: true },
};

/** Core visual states shared by the 3D core, status pill, and HUD accents. */
export const coreStateColor: Record<string, string> = {
  BOOTING: palette.blue,
  IDLE: palette.cyan,
  LISTENING: palette.cyanSoft,
  THINKING: palette.violet,
  SPEAKING: palette.blue,
  PROCESSING: palette.violet,
  DIAGNOSTICS: palette.cyan,
  WARNING: palette.orange,
  ERROR: palette.danger,
  OFFLINE: palette.textMuted,
};
