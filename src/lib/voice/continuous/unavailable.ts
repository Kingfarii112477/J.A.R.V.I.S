import type { ContinuousListeningProvider, ListeningSnapshot } from "./types";

const NOT_AVAILABLE =
  "Hands-free continuous listening requires the native J.A.R.V.I.S Android app — a browser tab can't run a background wake-word service.";

const STOPPED: ListeningSnapshot = {
  state: "STOPPED",
  suspendReason: "NONE",
  engineId: "unavailable",
  available: false,
  detail: NOT_AVAILABLE,
};

/**
 * The honest fallback for every context that isn't the native Android
 * shell — a normal browser tab, the Netlify deployment loaded directly,
 * or a WebView without the plugin registered.
 *
 * Every method reports failure with a clear reason. Nothing here ever
 * pretends the microphone is open, and start() never resolves as
 * started — the web's "wake word" mode remains the honestly-scoped
 * foreground-only keyword spotter (lib/voice/wakeWord.ts), which is a
 * different, clearly-labelled capability.
 */
export const unavailableContinuousProvider: ContinuousListeningProvider = {
  id: "unavailable",
  checkAvailability: async () => ({ available: false, engineId: "unavailable", reason: NOT_AVAILABLE }),
  getState: async () => STOPPED,
  start: async () => ({ started: false, reason: NOT_AVAILABLE }),
  stop: async () => {},
  resumeStandby: async () => {},
  handOff: async () => {},
  subscribe: () => () => {},
};
