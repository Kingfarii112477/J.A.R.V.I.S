import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  ChatMessage,
  JarvisSettings,
  JarvisState,
  Protocol,
  RadarTarget,
  Subsystem,
  TelemetrySnapshot,
  TerminalLine,
} from "@/types/jarvis";
import type { JarvisTask, TaskStatus } from "@/types/tasks";

const VALID_STT_PROVIDERS: readonly JarvisSettings["sttProvider"][] = ["browser", "whisper", "assemblyai"];
const VALID_TTS_PROVIDERS: readonly JarvisSettings["ttsProvider"][] = ["browser", "openai", "elevenlabs", "azure"];

/** Resolves a factory-default provider from a build-time env var, falling
 * back to `fallback` when the var is unset or isn't one of the known
 * values — never lets a typo'd env var produce an invalid provider id.
 * Exported so the validation itself is directly testable without
 * reaching into module-load-time environment state. Carries no secret
 * (just a provider *name*, e.g. "assemblyai"), which is what makes it
 * safe to read via the NEXT_PUBLIC_ prefix — Next.js inlines
 * NEXT_PUBLIC_* vars into the client bundle at build time, which is
 * exactly how a plain client-side Zustand default can know about a
 * server operator's provider preference at all; the actual STT/TTS API
 * keys stay server-only, read only from src/app/api/voice/*. */
export function envDefaultProvider<T extends string>(envValue: string | undefined, valid: readonly T[], fallback: T): T {
  return (valid as readonly string[]).includes(envValue ?? "") ? (envValue as T) : fallback;
}

export const defaultSettings: JarvisSettings = {
  aiName: "J.A.R.V.I.S.",
  language: "English",
  theme: "cybernetic-blue",
  holographicEffects: true,
  interfaceOpacity: 90,
  animations: true,
  dataAnalytics: true,
  graphicsQuality: "high",

  voiceEnabled: true,
  autoSpeak: true,
  voicePitch: 1,
  voiceRate: 1,
  voiceVolume: 100,
  soundEffects: true,
  soundVolume: 60,

  aiPersonalityVerbosity: "balanced",
  aiAddressUser: "",
  proactiveSuggestions: true,

  lockScreenEnabled: false,
  sessionTimeoutMinutes: 15,

  notificationsEnabled: true,
  notifyOnThreat: true,
  notifyOnDiagnostics: true,

  reducedMotion: false,
  skipBootAnimation: false,
  debugMode: false,

  memoryProvider: "local",
  sttProvider: envDefaultProvider(process.env.NEXT_PUBLIC_VOICE_STT_PROVIDER, VALID_STT_PROVIDERS, "browser"),
  ttsProvider: envDefaultProvider(process.env.NEXT_PUBLIC_VOICE_TTS_PROVIDER, VALID_TTS_PROVIDERS, "browser"),
  strictToolConfirmation: false,
  auditLoggingEnabled: true,
  autonomyLevel: 2,

  autoLanguageDetection: true,
  preferredLanguage: "auto",
  autoSubmitSpeech: true,
  silenceTimeoutMs: 1500,
  voiceInterruptEnabled: true,
  voiceConfirmationsEnabled: true,
  wakeWordMode: "click-to-talk",
};

export const defaultSubsystems: Subsystem[] = [
  { id: "neuralCore", label: "Neural Core", state: "ONLINE", health: 98, latencyMs: 12, activity: 62 },
  { id: "voiceSystem", label: "Voice System", state: "ONLINE", health: 96, latencyMs: 98, activity: 24 },
  { id: "memoryBank", label: "Memory Bank", state: "ONLINE", health: 99, latencyMs: 8, activity: 41 },
  { id: "securityGrid", label: "Security Grid", state: "ONLINE", health: 100, latencyMs: 5, activity: 18 },
  { id: "quantumLink", label: "Quantum Link", state: "ONLINE", health: 94, latencyMs: 31, activity: 55 },
  { id: "tacticalMatrix", label: "Tactical Matrix", state: "ONLINE", health: 97, latencyMs: 22, activity: 33 },
];

export const defaultProtocols: Protocol[] = [
  { id: "neural-protection", label: "Neural Protection", status: "ACTIVE", health: 99, lastUpdate: Date.now() },
  { id: "quantum-encryption", label: "Quantum Encryption", status: "ACTIVE", health: 100, lastUpdate: Date.now() },
  { id: "network-defense", label: "Network Defense", status: "ACTIVE", health: 97, lastUpdate: Date.now() },
  { id: "threat-detection", label: "Threat Detection", status: "ACTIVE", health: 95, lastUpdate: Date.now() },
  { id: "data-sync", label: "Data Synchronization", status: "ACTIVE", health: 98, lastUpdate: Date.now() },
  { id: "power-core", label: "Power Core Regulation", status: "ACTIVE", health: 99, lastUpdate: Date.now() },
  { id: "thermal-reg", label: "Thermal Regulation", status: "ACTIVE", health: 96, lastUpdate: Date.now() },
  { id: "voice-uplink", label: "Voice Uplink", status: "STANDBY", health: 90, lastUpdate: Date.now() },
];

export const initialTelemetry: TelemetrySnapshot = {
  cpu: 42,
  memory: 55,
  neuralActivity: 68,
  aiStability: 97,
  signalStrength: 88,
  networkStability: 91,
  voiceLatencyMs: 90,
  aiResponseMs: 140,
  dataFlow: 72,
  power: 96,
  threatLevel: 4,
};

interface JarvisStore {
  state: JarvisState;
  previousState: JarvisState;
  setState: (s: JarvisState) => void;

  secured: boolean;
  setSecured: (v: boolean) => void;
  locked: boolean;
  setLocked: (v: boolean) => void;
  sessionStartedAt: number;
  failedUnlockAttempts: number;
  incrementFailedUnlockAttempts: () => void;
  resetFailedUnlockAttempts: () => void;

  booted: boolean;
  setBooted: (v: boolean) => void;

  settings: JarvisSettings;
  updateSettings: (patch: Partial<JarvisSettings>) => void;
  resetSettings: () => void;

  messages: ChatMessage[];
  addMessage: (m: ChatMessage) => void;
  updateMessage: (id: string, patch: Partial<ChatMessage>) => void;
  clearMessages: () => void;

  terminalLines: TerminalLine[];
  pushTerminalLine: (l: Omit<TerminalLine, "id" | "timestamp">) => void;
  clearTerminal: () => void;

  telemetry: TelemetrySnapshot;
  setTelemetry: (t: TelemetrySnapshot) => void;

  subsystems: Subsystem[];
  setSubsystem: (id: string, patch: Partial<Subsystem>) => void;

  protocols: Protocol[];

  radarTargets: RadarTarget[];
  setRadarTargets: (t: RadarTarget[]) => void;

  diagnosticsRunning: boolean;
  diagnosticsProgress: number;
  diagnosticsScore: number;
  lastDiagnosticsRun: number | null;
  setDiagnostics: (patch: Partial<{
    diagnosticsRunning: boolean;
    diagnosticsProgress: number;
    diagnosticsScore: number;
    lastDiagnosticsRun: number | null;
  }>) => void;

  aiConnection: "unknown" | "connected" | "demo" | "error";
  setAiConnection: (v: "unknown" | "connected" | "demo" | "error") => void;

  toasts: { id: string; message: string; variant: "info" | "success" | "warning" | "error" | "system"; title?: string }[];
  pushToast: (message: string, variant?: "info" | "success" | "warning" | "error" | "system", title?: string) => void;
  dismissToast: (id: string) => void;

  tasks: JarvisTask[];
  addTask: (input: { title: string; description?: string; priority?: JarvisTask["priority"]; dueAt?: number }) => JarvisTask;
  updateTaskStatus: (id: string, status: TaskStatus) => JarvisTask | null;
  removeTask: (id: string) => void;

  /** How many tool calls the reasoning engine currently has in flight —
   * drives the 3D core's particle activity ("multiple tools: increased
   * particle activity"). Never persisted; always starts at 0. */
  activeToolCalls: number;
  incrementActiveToolCalls: () => void;
  decrementActiveToolCalls: () => void;
}

let idCounter = 0;
function nextId(prefix: string) {
  idCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${idCounter}`;
}

/** Zustand's default persist merge is a shallow Object.assign at the top
 * level, so a persisted `settings` object from an older schema version
 * (e.g. localStorage written before Phase 5 added voiceVolume/
 * autoLanguageDetection/silenceTimeoutMs/wakeWordMode/etc.) would
 * otherwise *replace* defaultSettings entirely, leaving every new field
 * undefined for a returning user. Deep-merging settings specifically
 * keeps partial/stale storage from ever breaking the app. Exported as a
 * standalone function (rather than inlined in the persist() call below)
 * so it's directly unit-testable against exactly this upgrade scenario. */
export function mergeJarvisStore(persisted: unknown, current: JarvisStore): JarvisStore {
  const persistedState = (persisted ?? {}) as Partial<JarvisStore>;
  return {
    ...current,
    ...persistedState,
    settings: { ...current.settings, ...(persistedState.settings ?? {}) },
  };
}

export const useJarvisStore = create<JarvisStore>()(
  persist(
    (set, get) => ({
      state: "BOOTING",
      previousState: "BOOTING",
      setState: (s) =>
        set((prev) => ({ previousState: prev.state, state: s })),

      secured: true,
      setSecured: (v) => set({ secured: v }),
      locked: false,
      setLocked: (v) => set({ locked: v }),
      sessionStartedAt: Date.now(),
      failedUnlockAttempts: 0,
      incrementFailedUnlockAttempts: () => set((prev) => ({ failedUnlockAttempts: prev.failedUnlockAttempts + 1 })),
      resetFailedUnlockAttempts: () => set({ failedUnlockAttempts: 0 }),

      booted: false,
      setBooted: (v) => set({ booted: v }),

      settings: defaultSettings,
      updateSettings: (patch) =>
        set((prev) => ({ settings: { ...prev.settings, ...patch } })),
      resetSettings: () => set({ settings: defaultSettings }),

      messages: [],
      addMessage: (m) => set((prev) => ({ messages: [...prev.messages, m] })),
      updateMessage: (id, patch) =>
        set((prev) => ({
          messages: prev.messages.map((m) => (m.id === id ? { ...m, ...patch } : m)),
        })),
      clearMessages: () => set({ messages: [] }),

      terminalLines: [],
      pushTerminalLine: (l) =>
        set((prev) => ({
          terminalLines: [
            ...prev.terminalLines,
            { ...l, id: nextId("term"), timestamp: Date.now() },
          ].slice(-500),
        })),
      clearTerminal: () => set({ terminalLines: [] }),

      telemetry: initialTelemetry,
      setTelemetry: (t) => set({ telemetry: t }),

      subsystems: defaultSubsystems,
      setSubsystem: (id, patch) =>
        set((prev) => ({
          subsystems: prev.subsystems.map((s) => (s.id === id ? { ...s, ...patch } : s)),
        })),

      protocols: defaultProtocols,

      radarTargets: [],
      setRadarTargets: (t) => set({ radarTargets: t }),

      diagnosticsRunning: false,
      diagnosticsProgress: 0,
      diagnosticsScore: 98,
      lastDiagnosticsRun: null,
      setDiagnostics: (patch) => set(patch),

      aiConnection: "unknown",
      setAiConnection: (v) => set({ aiConnection: v }),

      toasts: [],
      pushToast: (message, variant = "info", title) =>
        set((prev) => ({ toasts: [...prev.toasts, { id: nextId("toast"), message, variant, title }] })),
      dismissToast: (id) => set((prev) => ({ toasts: prev.toasts.filter((t) => t.id !== id) })),

      tasks: [],
      addTask: (input) => {
        const now = Date.now();
        const task: JarvisTask = {
          id: nextId("task"),
          title: input.title,
          description: input.description,
          status: "PENDING",
          priority: input.priority ?? "medium",
          createdAt: now,
          updatedAt: now,
          dueAt: input.dueAt,
        };
        set((prev) => ({ tasks: [...prev.tasks, task] }));
        return task;
      },
      updateTaskStatus: (id, status) => {
        const state = get();
        const idx = state.tasks.findIndex((t) => t.id === id);
        if (idx === -1) return null;
        const updated: JarvisTask = { ...state.tasks[idx], status, updatedAt: Date.now() };
        const next = [...state.tasks];
        next[idx] = updated;
        set({ tasks: next });
        return updated;
      },
      removeTask: (id) => set((prev) => ({ tasks: prev.tasks.filter((t) => t.id !== id) })),

      activeToolCalls: 0,
      incrementActiveToolCalls: () => set((prev) => ({ activeToolCalls: prev.activeToolCalls + 1 })),
      decrementActiveToolCalls: () => set((prev) => ({ activeToolCalls: Math.max(0, prev.activeToolCalls - 1) })),
    }),
    {
      name: "jarvis-os-store",
      partialize: (state) => ({
        settings: state.settings,
        secured: state.secured,
        tasks: state.tasks,
      }),
      merge: mergeJarvisStore,
    }
  )
);
