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
  /** Present when this assistant message is a mission proposal/progress
   * card (see lib/orchestration/missionSnapshot.ts) — a lightweight,
   * display-only snapshot refreshed via updateMessage() as mission.*
   * events arrive, exactly like toolCall above. */
  mission?: import("@/lib/orchestration/missionSnapshot").MissionSnapshot;
  /** TTS-safe rendering of `content` (see lib/voice/speechFormatter.ts) —
   * never shown on screen, only handed to the speech pipeline. Undefined
   * for messages that were never spoken (tool cards, system messages). */
  speechContent?: string;
  /** Detected input language for this turn (see lib/voice/language/), set
   * on the user message that triggered the response — drives both the
   * response-language policy and the TTS voice profile selection. */
  detectedLanguage?: import("@/lib/voice/language/types").LanguageCode;
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
  /** TTS playback volume — distinct from soundVolume (UI click/notification
   * effects), since a user reasonably wants J.A.R.V.I.S's spoken voice
   * louder or quieter than the interface's own sound effects. */
  voiceVolume: number;
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
  ttsProvider: "browser" | "openai" | "elevenlabs" | "azure";
  strictToolConfirmation: boolean;
  auditLoggingEnabled: boolean;

  /** Phase 5 — Voice & Language. Auto-detection runs on every turn
   * (typed or spoken) regardless of this flag; turning it off just makes
   * the app always assume `preferredLanguage` instead of the detector's
   * result (see lib/voice/language/). */
  autoLanguageDetection: boolean;
  preferredLanguage: "auto" | "en" | "ur" | "hi";
  autoSubmitSpeech: boolean;
  /** Milliseconds of continuous silence before auto-submitting — feeds
   * lib/voice/vad.ts's tick-based threshold (converted from the ~33ms
   * tick rate useVoice.ts samples at). */
  silenceTimeoutMs: number;
  voiceInterruptEnabled: boolean;
  /** Whether a CONFIRM-level tool request during a voice turn is spoken
   * aloud and can be answered by saying "yes"/"no", vs. requiring the
   * on-screen button either way. */
  voiceConfirmationsEnabled: boolean;
  /** Browser mics can't be always-on by default (privacy + permission
   * model) — "wake-word" runs a real, foreground-only keyword spotter
   * (see lib/voice/wakeWord.ts) that listens for "Jarvis" while the
   * Voice screen is open and microphone permission is already granted;
   * it is never a background/always-listening service. */
  wakeWordMode: "push-to-talk" | "click-to-talk" | "wake-word";

  /** 0 Manual / 1 Assisted / 2 Supervised (default) / 3 Delegated /
   * 4 Controlled Autonomous — see lib/autonomy/autonomyLevels.ts. Governs
   * every autonomous mission; never changed automatically. */
  autonomyLevel: 0 | 1 | 2 | 3 | 4;
}
