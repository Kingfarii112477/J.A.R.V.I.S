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
}
