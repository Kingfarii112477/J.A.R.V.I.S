/** Canonical J.A.R.V.I.S system state machine. Drives core animation, the
 * status indicator, voice UI, terminal echoes, and telemetry bias. */
export type JarvisState =
  | "BOOTING"
  | "IDLE"
  | "LISTENING"
  | "THINKING"
  | "SPEAKING"
  | "PROCESSING"
  | "DIAGNOSTICS"
  | "WARNING"
  | "ERROR"
  | "OFFLINE";

export const JARVIS_STATES: JarvisState[] = [
  "BOOTING",
  "IDLE",
  "LISTENING",
  "THINKING",
  "SPEAKING",
  "PROCESSING",
  "DIAGNOSTICS",
  "WARNING",
  "ERROR",
  "OFFLINE",
];

export type ToolCallStatus = "pending_confirmation" | "running" | "success" | "error" | "cancelled";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: number;
  status?: "pending" | "streaming" | "complete" | "error";
  toolCall?: {
    toolName: string;
    status: ToolCallStatus;
    summary?: string;
    args?: Record<string, unknown>;
  };
}

export interface TelemetrySnapshot {
  cpu: number;
  memory: number;
  neuralActivity: number;
  aiStability: number;
  signalStrength: number;
  networkStability: number;
  voiceLatencyMs: number;
  aiResponseMs: number;
  dataFlow: number;
  power: number;
  threatLevel: number;
}

export type SubsystemId =
  | "neuralCore"
  | "voiceSystem"
  | "memoryBank"
  | "securityGrid"
  | "quantumLink"
  | "tacticalMatrix";

export interface Subsystem {
  id: SubsystemId;
  label: string;
  state: "ONLINE" | "DEGRADED" | "OFFLINE";
  health: number;
  latencyMs: number;
  activity: number;
}

export interface Protocol {
  id: string;
  label: string;
  status: "ACTIVE" | "STANDBY" | "DISABLED";
  health: number;
  lastUpdate: number;
}

export interface RadarTarget {
  id: string;
  angleDeg: number;
  distance: number; // 0..1 normalized from center
  classification: "UNKNOWN" | "FRIENDLY" | "NEUTRAL" | "THREAT";
  signal: number;
  createdAt: number;
  fadeAt: number;
}

export interface MemoryCategory {
  id: string;
  label: string;
  gb: number;
  color: string;
  icon: string;
}

export interface DiagnosticMetric {
  id: string;
  label: string;
  value: number;
  unit: "%" | "ms" | "h";
  target: number;
}

export interface TerminalLine {
  id: string;
  kind: "input" | "output" | "system";
  text: string;
  timestamp: number;
}

export type GraphicsQualitySetting = "low" | "balanced" | "high" | "ultra";

export interface JarvisSettings {
  aiName: string;
  language: string;
  theme: "cybernetic-blue" | "crimson-protocol" | "violet-nexus";
  holographicEffects: boolean;
  interfaceOpacity: number;
  animations: boolean;
  dataAnalytics: boolean;
  graphicsQuality: GraphicsQualitySetting;

  voiceEnabled: boolean;
  autoSpeak: boolean;
  voicePitch: number;
  voiceRate: number;
  soundEffects: boolean;
  soundVolume: number;

  aiPersonalityVerbosity: "concise" | "balanced" | "detailed";
  aiAddressUser: string;
  proactiveSuggestions: boolean;

  lockScreenEnabled: boolean;
  sessionTimeoutMinutes: number;

  notificationsEnabled: boolean;
  notifyOnThreat: boolean;
  notifyOnDiagnostics: boolean;

  reducedMotion: boolean;
  skipBootAnimation: boolean;
  debugMode: boolean;

  memoryProvider: "local" | "supabase" | "vector";
  sttProvider: "browser" | "whisper" | "assemblyai";
  ttsProvider: "browser" | "openai" | "elevenlabs";
  strictToolConfirmation: boolean;
  auditLoggingEnabled: boolean;

  /** 0 Manual / 1 Assisted / 2 Supervised (default) / 3 Delegated /
   * 4 Controlled Autonomous — see lib/autonomy/autonomyLevels.ts. Governs
   * every autonomous mission; never changed automatically. */
  autonomyLevel: 0 | 1 | 2 | 3 | 4;
}
