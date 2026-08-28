export interface STTResult {
  transcript: string;
  isFinal: boolean;
  confidence?: number;
  /** Real per-utterance language code from the provider (AssemblyAI's own
   * `language_detection`), when the provider supports it — one signal fed
   * into lib/voice/language/detect.ts alongside the app's own heuristic
   * classifier, not a replacement for it (AssemblyAI doesn't have a
   * "roman-ur"/"hinglish" concept). */
  detectedLanguageCode?: string;
}

export type STTErrorCode = "unavailable" | "error";

export interface STTOptions {
  lang?: string;
  onResult: (result: STTResult) => void;
  onEnd?: () => void;
  onError?: (message: string, code?: STTErrorCode) => void;
  onStart?: () => void;
}

/** startSession/stopSession/transcribe/stream/cancel/getStatus, as named
 * concepts in the Phase 5 spec, map onto this interface's actual methods
 * as: start() ~ startSession()+stream(), stop() ~ stopSession(), the
 * onResult callback ~ transcribe()'s result, abort() ~ cancel(), and
 * isSupported() ~ getStatus(). Kept as this smaller, already-proven set
 * (unchanged from Phase 2) rather than a 1:1 six-method surface — every
 * concrete provider below (browser streaming, AssemblyAI batch) implements
 * it identically, and UI code never needs to know which one is active. */
export interface SpeechRecognitionProvider {
  id: string;
  isSupported(): boolean;
  start(opts: STTOptions): void;
  stop(): void;
  abort(): void;
}
