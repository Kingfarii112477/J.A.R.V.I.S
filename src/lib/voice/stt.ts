export interface STTResult {
  transcript: string;
  isFinal: boolean;
}

export interface STTOptions {
  lang?: string;
  onResult: (result: STTResult) => void;
  onEnd?: () => void;
  onError?: (message: string) => void;
  onStart?: () => void;
}

export interface SpeechRecognitionProvider {
  id: string;
  isSupported(): boolean;
  start(opts: STTOptions): void;
  stop(): void;
  abort(): void;
}

function getRecognitionCtor() {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;
}

/** Browser Web Speech API implementation — no API key required. The
 * interface is intentionally provider-agnostic so a future server-proxied
 * Whisper or AssemblyAI backend can implement the same contract (uploading
 * recorded audio instead of using the in-browser recognizer) without any
 * change to the Voice screen. */
class BrowserSTTProvider implements SpeechRecognitionProvider {
  id = "browser";
  private recognition: SpeechRecognitionLike | null = null;

  isSupported(): boolean {
    return getRecognitionCtor() !== null;
  }

  start(opts: STTOptions) {
    const Ctor = getRecognitionCtor();
    if (!Ctor) {
      opts.onError?.("Speech recognition is not supported in this browser.");
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
        opts.onResult({ transcript, isFinal: result.isFinal });
      }
    };
    recognition.onerror = (event) => {
      const messages: Record<string, string> = {
        "not-allowed": "Microphone access was denied.",
        "no-speech": "No speech detected.",
        "audio-capture": "No microphone was found.",
        network: "A network error interrupted speech recognition.",
      };
      opts.onError?.(messages[event.error] ?? `Speech recognition error: ${event.error}`);
    };
    recognition.onend = () => opts.onEnd?.();

    this.recognition = recognition;
    try {
      recognition.start();
    } catch {
      opts.onError?.("Could not start speech recognition.");
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

const browserSTTProvider = new BrowserSTTProvider();

export function getSTTProvider(): SpeechRecognitionProvider {
  return browserSTTProvider;
}

export async function requestMicrophonePermission(): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) return false;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((track) => track.stop());
    return true;
  } catch {
    return false;
  }
}
