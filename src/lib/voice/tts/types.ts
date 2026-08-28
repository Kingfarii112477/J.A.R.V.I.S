export type TTSErrorCode = "unavailable" | "error";

export interface SpeakOptions {
  rate?: number;
  pitch?: number;
  volume?: number;
  /** A voice-profile hint (see voiceProfiles.ts) — providers that support
   * per-request voice selection (Azure) use it to pick a language-
   * appropriate neural voice; providers that don't (browser, OpenAI,
   * ElevenLabs) ignore it safely. */
  languageHint?: import("../language/types").LanguageCode;
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (message: string, code?: TTSErrorCode) => void;
}

export interface TextToSpeechProvider {
  id: string;
  isAvailable(): boolean;
  speak(text: string, opts?: SpeakOptions): void;
  cancel(): void;
  /** Exposes the currently-playing element read-only, so a caller (the
   * JarvisCore audio-reactivity hook — see lib/voice/ttsAmplitude.ts) can
   * attach an AnalyserNode to it without this provider needing to know
   * anything about visualization. Only server-proxied providers
   * (Azure/OpenAI/ElevenLabs) can offer this; the browser SpeechSynthesis
   * fallback has no audio element to expose, so it's optional. */
  currentAudioElement?(): HTMLAudioElement | null;
}
