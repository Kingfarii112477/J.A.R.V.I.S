import type { SpeakOptions, TextToSpeechProvider } from "./types";

/** Fetches synthesized speech audio from a server route (Azure, OpenAI, or
 * ElevenLabs — whichever the server has credentials for) and plays it
 * back. `cancel()` immediately stops playback for real-time interrupt
 * support (barge-in — see useVoice.ts). One shared class for every
 * server-proxied provider, since the fetch/play/cancel shape is identical
 * and only the `provider` field posted to the route (and, for Azure, the
 * language hint) differs. */
export class ServerTTSProvider implements TextToSpeechProvider {
  id: string;
  private providerId: "openai" | "elevenlabs" | "azure";
  private audio: HTMLAudioElement | null = null;
  private objectUrl: string | null = null;
  private aborted = false;

  constructor(providerId: "openai" | "elevenlabs" | "azure") {
    this.providerId = providerId;
    this.id = providerId;
  }

  isAvailable(): boolean {
    return typeof window !== "undefined" && typeof Audio !== "undefined";
  }

  async speak(text: string, opts: SpeakOptions = {}) {
    this.cancel();
    this.aborted = false;

    if (!this.isAvailable()) {
      opts.onError?.("Audio playback is not supported in this browser.", "unavailable");
      return;
    }

    try {
      const res = await fetch("/api/voice/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, provider: this.providerId, languageHint: opts.languageHint }),
      });
      if (this.aborted) return;

      if (res.status === 501) {
        const body = await res.json().catch(() => ({}) as { message?: string });
        opts.onError?.(body.message ?? `${this.providerId} TTS is not configured on the server.`, "unavailable");
        return;
      }
      if (!res.ok) {
        opts.onError?.("Speech synthesis request failed.", "error");
        return;
      }

      const blob = await res.blob();
      if (this.aborted) return;

      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.volume = opts.volume ?? 1;
      audio.playbackRate = opts.rate ?? 1;
      audio.onplay = () => opts.onStart?.();
      audio.onended = () => {
        URL.revokeObjectURL(url);
        opts.onEnd?.();
      };
      audio.onerror = () => {
        URL.revokeObjectURL(url);
        opts.onError?.("Audio playback failed.", "error");
      };
      this.audio = audio;
      this.objectUrl = url;

      // A separate try/catch for play() itself: a rejected play() promise
      // (most commonly the browser's autoplay policy blocking it) is a
      // materially different problem from the fetch above failing, and
      // deserves an honest message rather than "could not reach the
      // service" when the service was reached just fine.
      try {
        await audio.play();
      } catch (playErr) {
        if (this.aborted) return;
        const blocked = playErr instanceof Error && playErr.name === "NotAllowedError";
        opts.onError?.(
          blocked ? "Audio playback was blocked by the browser. Tap anywhere to allow audio, then try again." : "Audio playback failed.",
          "error"
        );
      }
    } catch {
      if (!this.aborted) opts.onError?.("Could not reach the speech synthesis service.", "error");
    }
  }

  /** Exposes the currently-playing element read-only, so a caller (the
   * JarvisCore audio-reactivity hook) can attach an AnalyserNode to it
   * without this class needing to know anything about visualization. */
  currentAudioElement(): HTMLAudioElement | null {
    return this.audio;
  }

  cancel() {
    this.aborted = true;
    if (this.audio) {
      this.audio.pause();
      this.audio.currentTime = 0;
      this.audio = null;
    }
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
  }
}
