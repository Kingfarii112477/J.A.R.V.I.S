import { registerPlugin, type PluginListenerHandle } from "@capacitor/core";
import type {
  ContinuousAvailability,
  ContinuousListeningHandlers,
  ContinuousListeningProvider,
  ListeningSnapshot,
  StartListeningResult,
} from "./types";

/**
 * Raw JS-facing shape of the native Kotlin plugin (see
 * android/.../listening/ContinuousListeningPlugin.kt). Event names and
 * payload shapes are mirrored from that file — keep them in sync.
 */
interface ContinuousListeningPluginInterface {
  isAvailable(): Promise<ContinuousAvailability>;
  getState(): Promise<ListeningSnapshot>;
  start(options: { sensitivity: number; batterySaver: boolean }): Promise<StartListeningResult>;
  stop(): Promise<void>;
  resumeStandby(): Promise<void>;
  handOff(): Promise<void>;
  addListener(event: "wakeWordDetected", cb: () => void): Promise<PluginListenerHandle>;
  addListener(event: "listeningStateChanged", cb: (snapshot: ListeningSnapshot) => void): Promise<PluginListenerHandle>;
  addListener(event: "listeningError", cb: (payload: { message: string }) => void): Promise<PluginListenerHandle>;
}

const ContinuousListening = registerPlugin<ContinuousListeningPluginInterface>("ContinuousListening");

const UNKNOWN_FAILURE = "The native listening service could not be reached.";

/** Turns a thrown plugin call into an honest failure result rather than
 * an unhandled rejection reaching the voice pipeline — same defensive
 * wrapper the device bridge uses (lib/device/native.ts). */
async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}

export const nativeContinuousProvider: ContinuousListeningProvider = {
  id: "native",

  checkAvailability: async () =>
    safe(() => ContinuousListening.isAvailable(), {
      available: false,
      engineId: "unavailable",
      reason: UNKNOWN_FAILURE,
    }),

  getState: async () =>
    safe(() => ContinuousListening.getState(), {
      state: "STOPPED",
      suspendReason: "NONE",
      engineId: "unavailable",
      available: false,
      detail: UNKNOWN_FAILURE,
    }),

  start: async (options) =>
    safe(() => ContinuousListening.start(options), { started: false, reason: UNKNOWN_FAILURE }),

  stop: async () => {
    await safe(() => ContinuousListening.stop(), undefined);
  },

  resumeStandby: async () => {
    await safe(() => ContinuousListening.resumeStandby(), undefined);
  },

  handOff: async () => {
    await safe(() => ContinuousListening.handOff(), undefined);
  },

  subscribe: (handlers: ContinuousListeningHandlers) => {
    // addListener resolves asynchronously; collect handles as they
    // arrive and tolerate an unsubscribe that races ahead of them.
    let cancelled = false;
    const handles: PluginListenerHandle[] = [];

    const track = (promise: Promise<PluginListenerHandle>) => {
      promise
        .then((handle) => {
          if (cancelled) void handle.remove();
          else handles.push(handle);
        })
        .catch(() => {});
    };

    track(ContinuousListening.addListener("wakeWordDetected", () => handlers.onWakeWord()));
    track(ContinuousListening.addListener("listeningStateChanged", (snapshot) => handlers.onStateChange(snapshot)));
    track(ContinuousListening.addListener("listeningError", (payload) => handlers.onError(payload.message)));

    return () => {
      cancelled = true;
      for (const handle of handles) void handle.remove();
      handles.length = 0;
    };
  },
};
