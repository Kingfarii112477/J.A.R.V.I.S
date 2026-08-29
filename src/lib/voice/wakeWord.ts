/**
 * Wake-word activation architecture.
 *
 * Phase 5 shipped this as an interface plus a disabled no-op — an
 * always-listening engine is a real privacy commitment this app
 * shouldn't make silently, and browsers require an explicit user
 * gesture before microphone access is even grantable. Phase 6
 * implements the REAL, honestly-scoped version the native Android app
 * asked for:
 *
 * - Runs ONLY while the app is in the foreground and the Voice screen
 *   is actually mounted (see useVoice.ts) — never a background
 *   service. Android's Doze/background-execution limits make a
 *   genuine always-on background listener a materially bigger
 *   undertaking (a persistent foreground Service with its own ongoing
 *   notification); this is the safest supported mode short of that,
 *   exactly per the spec's own "if continuous background listening is
 *   restricted, implement the safest supported mode and clearly
 *   document the limitation" instruction. It is never described to the
 *   user as always-listening, because it isn't.
 * - Detection runs through the browser's own (on-device where the
 *   platform provides it) SpeechRecognition — the SAME engine
 *   lib/voice/stt/browser.ts already uses for real capture — restarted
 *   in a loop, listening only for the wake phrase. This is deliberately
 *   NOT AssemblyAI or any other cloud STT: nothing here streams
 *   continuous audio to a paid cloud transcription service solely to
 *   spot one word.
 * - Only ever starts after the user has explicitly turned on Wake Word
 *   mode in Settings AND microphone permission is already granted from
 *   an earlier explicit gesture — never triggers a fresh permission
 *   prompt on its own (same guard useVoice.ts already applies to
 *   auto-resuming after a spoken confirmation).
 * - On detecting the phrase, hands off to the exact same
 *   startListening() flow a manual tap already triggers — no second
 *   voice pipeline, no separate reasoning path.
 */

const WAKE_PHRASES = ["jarvis", "hey jarvis", "hey, jarvis", "okay jarvis", "ok jarvis"];

export function containsWakePhrase(transcript: string): boolean {
  const normalized = transcript.toLowerCase();
  return WAKE_PHRASES.some((phrase) => normalized.includes(phrase));
}

export interface WakeWordProvider {
  id: string;
  isSupported(): boolean;
  start(onWake: () => void, onError?: (message: string) => void): void;
  stop(): void;
}

/** Always-inert — isSupported() is false, so callers should never invoke
 * start() on it. Used whenever the browser has no SpeechRecognition
 * implementation at all. */
export const disabledWakeWordProvider: WakeWordProvider = {
  id: "disabled",
  isSupported: () => false,
  start: () => {},
  stop: () => {},
};

function getRecognitionCtor() {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;
}

/** Foreground-only keyword spotter — see the module doc comment above
 * for exactly what this is and isn't. One short (non-continuous)
 * recognition session at a time, immediately restarted on end/error
 * (aside from routine "no-speech" timeouts) for as long as start() has
 * been called and stop() hasn't — a restart LOOP, not one long-running
 * session, since SpeechRecognition sessions naturally time out on
 * silence and need re-arming. */
class ForegroundKeywordWakeWordProvider implements WakeWordProvider {
  id = "foreground-keyword";
  private recognition: SpeechRecognitionLike | null = null;
  private active = false;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;
  private onWakeCb: (() => void) | null = null;
  private onErrorCb: ((message: string) => void) | null = null;

  isSupported(): boolean {
    return getRecognitionCtor() !== null;
  }

  start(onWake: () => void, onError?: (message: string) => void) {
    if (!this.isSupported()) {
      onError?.("Wake-word listening isn't supported in this browser.");
      return;
    }
    if (this.active) return;
    this.active = true;
    this.onWakeCb = onWake;
    this.onErrorCb = onError ?? null;
    this.beginCycle();
  }

  stop() {
    this.active = false;
    this.onWakeCb = null;
    this.onErrorCb = null;
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    this.recognition?.abort();
    this.recognition = null;
  }

  private beginCycle() {
    if (!this.active) return;
    const Ctor = getRecognitionCtor();
    if (!Ctor) return;

    const recognition = new Ctor();
    recognition.lang = "en-US"; // the wake phrase itself is always English, regardless of conversational language
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      let transcript = "";
      for (let i = 0; i < event.results.length; i++) {
        transcript += ` ${event.results[i]?.[0]?.transcript ?? ""}`;
      }
      if (containsWakePhrase(transcript)) {
        // Deliberately does NOT restart the cycle here — the caller
        // (useVoice.ts) is expected to call stop() as it transitions into
        // real capture, then start() again once that turn finishes. If it
        // doesn't, this provider simply stays idle rather than doubling up
        // on microphone access.
        this.onWakeCb?.();
        return;
      }
      this.scheduleRestart();
    };
    recognition.onerror = (event) => {
      // "no-speech"/"aborted" are routine restarts, not real errors.
      if (event.error !== "no-speech" && event.error !== "aborted") {
        this.onErrorCb?.(`Wake-word listening error: ${event.error}`);
      }
      this.scheduleRestart();
    };
    recognition.onend = () => this.scheduleRestart();

    this.recognition = recognition;
    try {
      recognition.start();
    } catch {
      this.scheduleRestart();
    }
  }

  private scheduleRestart() {
    this.recognition = null;
    if (!this.active) return;
    // A short delay avoids a tight synchronous restart loop if start()
    // fails immediately (e.g. a permission race).
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      this.beginCycle();
    }, 250);
  }
}

export const foregroundKeywordWakeWordProvider: WakeWordProvider = new ForegroundKeywordWakeWordProvider();

export function getWakeWordProvider(): WakeWordProvider {
  return foregroundKeywordWakeWordProvider.isSupported() ? foregroundKeywordWakeWordProvider : disabledWakeWordProvider;
}
