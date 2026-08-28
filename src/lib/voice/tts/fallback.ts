import type { TextToSpeechProvider } from "./types";

/** Browser SpeechSynthesis — zero-config, works without any API key. This
 * is the last-resort fallback whenever a server-proxied provider (Azure,
 * OpenAI, ElevenLabs) isn't configured or fails, and the zero-config
 * default when no provider is selected at all. */
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
