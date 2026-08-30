"use client";

import type {
  ContinuousListeningHandlers,
  ContinuousListeningProvider,
  ListeningSnapshot,
} from "./types";
import { OpenWakeWordWebEngine, type WebWakeStatus } from "@/lib/voice/wake/openWakeWordWeb";
import { VOICE_DEFAULTS } from "@/config/voice";

/**
 * Real browser continuous listening, using openWakeWord's ONNX models in
 * the tab itself (see lib/voice/wake/openWakeWordWeb.ts).
 *
 * This replaces what used to be an honest "not available in a browser"
 * stub. It is genuinely available now — but with browser-shaped limits
 * that this provider reports rather than hides:
 *
 *  - Requires a secure (HTTPS) page; getUserMedia doesn't exist on http.
 *  - Only listens while the page is alive. A browser may suspend timers
 *    and audio in a backgrounded tab, and closing the tab stops it
 *    entirely. This is NOT background listening and never claims to be —
 *    that remains the native Android service's job.
 *  - The microphone permission is per-origin and revocable at any time.
 *
 * Detection is fully local: audio never leaves the tab during standby,
 * and only the command spoken after the wake phrase reaches the existing
 * STT pipeline.
 */

/** Maps the engine's own status to the shared snapshot shape, so the UI
 * has one vocabulary across web and native. */
function toSnapshot(status: WebWakeStatus, detail?: string): ListeningSnapshot {
  switch (status) {
    case "listening":
      return { state: "STANDBY", suspendReason: "NONE", engineId: "openwakeword-web", available: true, detail: null };
    case "warming-up":
      // Not a fault: the model chain needs ~3.1s of audio context before
      // its first score exists.
      return {
        state: "STANDBY",
        suspendReason: "NONE",
        engineId: "openwakeword-web",
        available: true,
        detail: "Warming up…",
      };
    case "loading-models":
      return {
        state: "STOPPED",
        suspendReason: "NONE",
        engineId: "openwakeword-web",
        available: true,
        detail: "Loading wake-word models…",
      };
    case "requesting-microphone":
      return {
        state: "STOPPED",
        suspendReason: "NONE",
        engineId: "openwakeword-web",
        available: true,
        detail: "Requesting microphone…",
      };
    case "error":
      return {
        state: "SUSPENDED",
        suspendReason: detail && /denied|permission/i.test(detail) ? "PERMISSION_DENIED" : "MICROPHONE_UNAVAILABLE",
        engineId: "openwakeword-web",
        available: true,
        detail: detail ?? "Wake-word listening stopped.",
      };
    default:
      return { state: "STOPPED", suspendReason: "NONE", engineId: "openwakeword-web", available: true, detail: null };
  }
}

let engine: OpenWakeWordWebEngine | null = null;
let snapshot: ListeningSnapshot = {
  state: "STOPPED",
  suspendReason: "NONE",
  engineId: "openwakeword-web",
  available: true,
  detail: null,
};
const subscribers = new Set<ContinuousListeningHandlers>();

function publish(next: ListeningSnapshot) {
  snapshot = next;
  for (const handler of subscribers) handler.onStateChange(next);
}

function getEngine(): OpenWakeWordWebEngine {
  if (!engine) engine = new OpenWakeWordWebEngine(VOICE_DEFAULTS.wakeWordThreshold, VOICE_DEFAULTS.wakeWordDebounceMs);
  return engine;
}

export const webContinuousProvider: ContinuousListeningProvider = {
  id: "web",

  checkAvailability: async () => {
    const supported = OpenWakeWordWebEngine.isSupported();
    return {
      available: supported,
      engineId: supported ? "openwakeword-web" : "unavailable",
      reason: supported
        ? null
        : typeof window !== "undefined" && window.isSecureContext === false
          ? "Wake-word listening needs a secure (HTTPS) page — browsers only allow microphone access over HTTPS."
          : "This browser doesn't support the microphone APIs wake-word listening needs.",
    };
  },

  getState: async () => snapshot,

  start: async ({ sensitivity }) => {
    const active = getEngine();
    // The stored 0..1 sensitivity is the inverse of a detection
    // threshold: higher sensitivity must mean an easier trigger.
    active.setThreshold(1 - Math.max(0, Math.min(1, sensitivity)));

    const started = await active.start({
      onWake: () => {
        for (const handler of subscribers) handler.onWakeWord();
      },
      onStatus: (status, detail) => publish(toSnapshot(status, detail)),
      onError: (message) => {
        for (const handler of subscribers) handler.onError(message);
      },
    });

    return started ? { started: true } : { started: false, reason: snapshot.detail ?? undefined };
  },

  stop: async () => {
    await engine?.stop();
    publish({ state: "STOPPED", suspendReason: "NONE", engineId: "openwakeword-web", available: true, detail: null });
  },

  /** In the browser the same engine instance owns the microphone
   * throughout, so re-arming is just restarting detection. */
  resumeStandby: async () => {
    const active = getEngine();
    if (active.isRunning) return;
    await active.start({
      onWake: () => {
        for (const handler of subscribers) handler.onWakeWord();
      },
      onStatus: (status, detail) => publish(toSnapshot(status, detail)),
      onError: (message) => {
        for (const handler of subscribers) handler.onError(message);
      },
    });
  },

  /** Release the mic so the existing STT capture can take it — the same
   * exclusive-input hand-off the native service performs. */
  handOff: async () => {
    await engine?.stop();
    publish({
      state: "HANDED_OFF",
      suspendReason: "NONE",
      engineId: "openwakeword-web",
      available: true,
      detail: null,
    });
  },

  subscribe: (handlers) => {
    subscribers.add(handlers);
    return () => {
      subscribers.delete(handlers);
    };
  },
};

/** Test-only: drops the module-level engine and subscribers. */
export function resetWebContinuousProvider() {
  engine = null;
  subscribers.clear();
  snapshot = { state: "STOPPED", suspendReason: "NONE", engineId: "openwakeword-web", available: true, detail: null };
}
