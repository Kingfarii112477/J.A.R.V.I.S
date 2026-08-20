export type TTSErrorCode = "unavailable" | "error";

export interface SpeakOptions {
  rate?: number;
  pitch?: number;
  volume?: number;
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (message: string, code?: TTSErrorCode) => void;
}

export interface TextToSpeechProvider {
  id: string;
  isAvailable(): boolean;
  speak(text: string, opts?: SpeakOptions): void;
  cancel(): void;
}

/** Browser SpeechSynthesis — zero-config, works without any API key. This
 * is the default provider and the automatic fallback whenever a
 * server-proxied provider below isn't configured. */
export const browserTTSProvider: TextToSpeechProvider = {
  id: "browser",
  isAvailable() {
    return typeof window !== "undefined" && "speechSynthesis" in window;
  },
  speak(text, opts = {}) {
    if (!this.isAvailable()) {
      opts.onError?.("Speech synthesis is not supported in this browser.", "unavailable");
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = opts.rate ?? 1;
    utterance.pitch = opts.pitch ?? 1;
    utterance.volume = opts.volume ?? 1;
    utterance.onstart = () => opts.onStart?.();
    utterance.onend = () => opts.onEnd?.();
    utterance.onerror = (e) => opts.onError?.(e.error || "Speech synthesis error.", "error");
    window.speechSynthesis.speak(utterance);
  },
  cancel() {
    if (this.isAvailable()) window.speechSynthesis.cancel();
  },
};

/** Fetches synthesized speech audio from a server route (OpenAI TTS or
 * ElevenLabs — whichever the server has an API key for) and plays it back.
 * `cancel()` immediately stops playback for real-time interrupt support. */
class ServerTTSProvider implements TextToSpeechProvider {
  id: string;
  private providerId: "openai" | "elevenlabs";
  private audio: HTMLAudioElement | null = null;
  private objectUrl: string | null = null;
  private aborted = false;

  constructor(providerId: "openai" | "elevenlabs") {
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
        body: JSON.stringify({ text, provider: this.providerId }),
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
      await audio.play();
    } catch {
      if (!this.aborted) opts.onError?.("Could not reach the speech synthesis service.", "error");
    }
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

const openaiTTSProvider = new ServerTTSProvider("openai");
const elevenlabsTTSProvider = new ServerTTSProvider("elevenlabs");

export function getTTSProvider(preferred?: "browser" | "openai" | "elevenlabs"): TextToSpeechProvider {
  if (preferred === "openai") return openaiTTSProvider;
  if (preferred === "elevenlabs") return elevenlabsTTSProvider;
  return browserTTSProvider;
}
