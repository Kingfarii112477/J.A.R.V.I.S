export interface SpeakOptions {
  rate?: number;
  pitch?: number;
  volume?: number;
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (message: string) => void;
}

export interface TextToSpeechProvider {
  id: string;
  isAvailable(): boolean;
  speak(text: string, opts?: SpeakOptions): void;
  cancel(): void;
}

/** Browser SpeechSynthesis — zero-config, works without any API key. This
 * is the default and only active provider today; the interface leaves room
 * for an OpenAI-compatible or ElevenLabs-compatible adapter to be dropped
 * in later behind the same `speak`/`cancel` contract. */
export const browserTTSProvider: TextToSpeechProvider = {
  id: "browser",
  isAvailable() {
    return typeof window !== "undefined" && "speechSynthesis" in window;
  },
  speak(text, opts = {}) {
    if (!this.isAvailable()) {
      opts.onError?.("Speech synthesis is not supported in this browser.");
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = opts.rate ?? 1;
    utterance.pitch = opts.pitch ?? 1;
    utterance.volume = opts.volume ?? 1;
    utterance.onstart = () => opts.onStart?.();
    utterance.onend = () => opts.onEnd?.();
    utterance.onerror = (e) => opts.onError?.(e.error || "Speech synthesis error.");
    window.speechSynthesis.speak(utterance);
  },
  cancel() {
    if (this.isAvailable()) window.speechSynthesis.cancel();
  },
};

export function getTTSProvider(): TextToSpeechProvider {
  return browserTTSProvider;
}
