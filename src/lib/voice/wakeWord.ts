/**
 * Wake-word activation architecture — deliberately just an interface plus
 * a disabled no-op today. Phase 5 does not ship an always-listening wake
 * engine: browsers require an explicit user gesture (click/tap) before
 * microphone access is even grantable, and an always-on mic is a real
 * privacy commitment this app shouldn't make silently. This interface
 * exists so a real wake-word engine (e.g. Porcupine, a small on-device
 * keyword model) can be dropped in later — see settings.wakeWordMode —
 * without changing anything else in the voice pipeline: useVoice.ts would
 * call start()/stop() the same way it calls startListening() today, and
 * react to onWake the same way a click currently triggers capture.
 */

export interface WakeWordProvider {
  id: string;
  isSupported(): boolean;
  start(onWake: () => void, onError?: (message: string) => void): void;
  stop(): void;
}

/** Always-inert — isSupported() is false, so callers should never invoke
 * start() on it. Selecting "wake-word" mode in Settings falls back to
 * click-to-talk behavior (see useVoice.ts) until a real provider exists. */
export const disabledWakeWordProvider: WakeWordProvider = {
  id: "disabled",
  isSupported: () => false,
  start: () => {},
  stop: () => {},
};

export function getWakeWordProvider(): WakeWordProvider {
  return disabledWakeWordProvider;
}
