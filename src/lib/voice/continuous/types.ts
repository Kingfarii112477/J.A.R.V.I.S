/**
 * Hands-free continuous listening — the web layer's view of the native
 * Android service (android/.../listening/ContinuousListeningService.kt).
 *
 * Same provider-abstraction pattern as lib/voice/stt/, lib/voice/tts/,
 * and lib/device/: one interface, a "native" implementation backed by a
 * real Capacitor plugin, and an "unavailable" implementation for every
 * context that isn't the native Android app — never a third path that
 * fakes listening.
 *
 * The split of responsibilities is deliberate and load-bearing:
 *   NATIVE owns the microphone during standby and the wake-word engine.
 *   WEB owns everything after the wake phrase — STT, language detection,
 *   the existing ReasoningEngine, tools, governance, and TTS.
 * That is what keeps this from becoming a second brain.
 */

/** Mirrors ListeningState.kt exactly — keep the two in sync. */
export type NativeListeningState =
  | "STOPPED"
  | "STANDBY"
  | "HANDED_OFF"
  | "SUSPENDED"
  | "UNAVAILABLE";

/** Mirrors SuspendReason.kt exactly — keep the two in sync. */
export type ListeningSuspendReason =
  | "NONE"
  | "AUDIO_FOCUS_LOST"
  | "PHONE_CALL"
  | "BATTERY_LOW"
  | "MICROPHONE_UNAVAILABLE"
  | "PERMISSION_DENIED";

export interface ListeningSnapshot {
  state: NativeListeningState;
  suspendReason: ListeningSuspendReason;
  /** "porcupine" when real on-device detection is running, "unavailable"
   * otherwise. Surfaced so the UI can name the actual engine rather than
   * implying a capability that isn't there. */
  engineId: string;
  available: boolean;
  /** Human-readable explanation for a suspended/unavailable state —
   * shown to the user verbatim rather than a generic "not listening". */
  detail: string | null;
}

export interface ContinuousAvailability {
  available: boolean;
  engineId: string;
  reason: string | null;
}

export interface StartListeningResult {
  started: boolean;
  reason?: string;
}

export interface ContinuousListeningHandlers {
  /** The wake phrase was genuinely heard by the on-device engine. This
   * is the ONLY thing that escapes the native standby loop — no audio,
   * no transcript, just the fact of detection. */
  onWakeWord: () => void;
  onStateChange: (snapshot: ListeningSnapshot) => void;
  onError: (message: string) => void;
}

export interface ContinuousListeningProvider {
  /** "native" = Android foreground service; "web" = real
   * openWakeWord detection in the browser tab; "unavailable" = no
   * detection possible here. Distinguished because the three have
   * genuinely different capabilities (only "native" survives
   * backgrounding) and the UI must not imply otherwise. */
  id: "native" | "web" | "unavailable";

  /** Whether this build/platform can do wake-word detection at all —
   * checked before offering the feature, so the UI never advertises
   * something that cannot work. */
  checkAvailability(): Promise<ContinuousAvailability>;

  /** Current native state. Used to resynchronize after a WebView
   * recreation, when the web layer has lost its copy but the native
   * service has been running the whole time. */
  getState(): Promise<ListeningSnapshot>;

  start(options: { sensitivity: number; batterySaver: boolean }): Promise<StartListeningResult>;
  stop(): Promise<void>;

  /** Re-arm wake-word detection after a full conversation turn (including
   * any follow-up window) has finished and the microphone is free. */
  resumeStandby(): Promise<void>;

  /** Release the native microphone before the web layer starts its own
   * capture — Android grants audio input to one consumer at a time. */
  handOff(): Promise<void>;

  /** Subscribes to native events; returns an unsubscribe function. */
  subscribe(handlers: ContinuousListeningHandlers): () => void;
}
