import type { SpeechRecognitionProvider, STTOptions } from "./types";

function getRecognitionCtor() {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;
}

/** Browser Web Speech API implementation — no API key required, no server
 * round trip. This is the zero-config default and the automatic fallback
 * whenever a server-proxied provider isn't configured. */
export class BrowserSTTProvider implements SpeechRecognitionProvider {
  id = "browser";
  private recognition: SpeechRecognitionLike | null = null;

  isSupported(): boolean {
    return getRecognitionCtor() !== null;
  }

  start(opts: STTOptions) {
    const Ctor = getRecognitionCtor();
    if (!Ctor) {
      opts.onError?.("Speech recognition is not supported in this browser.", "unavailable");
      return;
    }

    this.stop();
    const recognition = new Ctor();
    recognition.lang = opts.lang ?? "en-US";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => opts.onStart?.();
    recognition.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript = result[0]?.transcript ?? "";
        const confidence = typeof result[0]?.confidence === "number" ? result[0].confidence : undefined;
        opts.onResult({ transcript, isFinal: result.isFinal, confidence });
      }
    };
    recognition.onerror = (event) => {
      const messages: Record<string, string> = {
        "not-allowed": "Microphone access was denied.",
        "no-speech": "No speech detected.",
        "audio-capture": "No microphone was found.",
        network: "A network error interrupted speech recognition.",
      };
      opts.onError?.(messages[event.error] ?? `Speech recognition error: ${event.error}`, "error");
    };
    recognition.onend = () => opts.onEnd?.();

    this.recognition = recognition;
    try {
      recognition.start();
    } catch {
      opts.onError?.("Could not start speech recognition.", "error");
    }
  }

  stop() {
    this.recognition?.stop();
    this.recognition = null;
  }

  abort() {
    this.recognition?.abort();
    this.recognition = null;
  }
}

export const browserSTTProvider = new BrowserSTTProvider();

export type MicrophonePermissionResult = { granted: true } | { granted: false; reason: "denied" | "unavailable" | "error" };

/** Distinguishes *why* the mic didn't work — "denied" (the user said no,
 * they can fix it in site settings) is a materially different situation
 * from "unavailable" (no microphone hardware exists at all, permission
 * was never even the issue) and both from a generic transient "error".
 * Collapsing these into one boolean (as this used to) makes an honest,
 * actionable error message impossible. */
export async function requestMicrophonePermission(): Promise<MicrophonePermissionResult> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    return { granted: false, reason: "unavailable" };
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((track) => track.stop());
    return { granted: true };
  } catch (err) {
    const name = err instanceof Error ? err.name : "";
    if (name === "NotFoundError" || name === "DevicesNotFoundError" || name === "OverconstrainedError") {
      return { granted: false, reason: "unavailable" };
    }
    if (name === "NotAllowedError" || name === "PermissionDeniedError" || name === "SecurityError") {
      return { granted: false, reason: "denied" };
    }
    return { granted: false, reason: "error" };
  }
}
