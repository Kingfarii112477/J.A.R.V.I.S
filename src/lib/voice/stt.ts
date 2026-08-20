export interface STTResult {
  transcript: string;
  isFinal: boolean;
  confidence?: number;
}

export type STTErrorCode = "unavailable" | "error";

export interface STTOptions {
  lang?: string;
  onResult: (result: STTResult) => void;
  onEnd?: () => void;
  onError?: (message: string, code?: STTErrorCode) => void;
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

/** Browser Web Speech API implementation — no API key required, no server
 * round trip. This is the zero-config default and the automatic fallback
 * whenever a server-proxied provider below isn't configured. */
class BrowserSTTProvider implements SpeechRecognitionProvider {
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

/** Records audio with MediaRecorder and uploads it to a server route on
 * `stop()` for batch transcription (Whisper or AssemblyAI — whichever the
 * server has an API key for). There's no true interim-results stream with
 * a batch upload, so this only ever reports a single final result; the
 * caller sees an honest "unavailable" error (rather than a fabricated
 * transcript) if the server has no key configured for this provider. */
class ServerSTTProvider implements SpeechRecognitionProvider {
  id: string;
  private providerId: "whisper" | "assemblyai";
  private mediaRecorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private stream: MediaStream | null = null;
  private opts: STTOptions | null = null;
  private aborted = false;

  constructor(providerId: "whisper" | "assemblyai") {
    this.providerId = providerId;
    this.id = providerId;
  }

  isSupported(): boolean {
    return (
      typeof window !== "undefined" &&
      typeof MediaRecorder !== "undefined" &&
      Boolean(navigator.mediaDevices?.getUserMedia)
    );
  }

  async start(opts: STTOptions) {
    this.opts = opts;
    this.chunks = [];
    this.aborted = false;

    if (!this.isSupported()) {
      opts.onError?.("Audio recording is not supported in this browser.", "unavailable");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (this.aborted) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      this.stream = stream;
      const mimeType = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "";
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) this.chunks.push(e.data);
      };
      recorder.onstart = () => opts.onStart?.();
      recorder.onstop = () => {
        void this.transcribe();
      };
      recorder.start();
      this.mediaRecorder = recorder;
    } catch {
      opts.onError?.("Could not access the microphone.", "error");
    }
  }

  stop() {
    this.mediaRecorder?.stop();
    this.mediaRecorder = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
  }

  abort() {
    this.aborted = true;
    this.chunks = [];
    this.mediaRecorder?.stop();
    this.mediaRecorder = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.opts = null;
  }

  private async transcribe() {
    const opts = this.opts;
    if (!opts || this.aborted) return;
    if (this.chunks.length === 0) {
      opts.onEnd?.();
      return;
    }
    const blob = new Blob(this.chunks, { type: this.chunks[0].type || "audio/webm" });
    this.chunks = [];

    try {
      const form = new FormData();
      form.append("audio", blob, "speech.webm");
      form.append("provider", this.providerId);
      const res = await fetch("/api/voice/transcribe", { method: "POST", body: form });

      if (res.status === 501) {
        const body = await res.json().catch(() => ({}) as { message?: string });
        opts.onError?.(body.message ?? `${this.providerId} is not configured on the server.`, "unavailable");
        return;
      }
      if (!res.ok) {
        opts.onError?.("Transcription request failed.", "error");
        return;
      }
      const data = await res.json();
      opts.onResult({ transcript: data.transcript ?? "", isFinal: true, confidence: data.confidence });
    } catch {
      opts.onError?.("Could not reach the transcription service.", "error");
    } finally {
      opts.onEnd?.();
    }
  }
}

const browserSTTProvider = new BrowserSTTProvider();
const whisperSTTProvider = new ServerSTTProvider("whisper");
const assemblyAISTTProvider = new ServerSTTProvider("assemblyai");

export function getSTTProvider(preferred?: "browser" | "whisper" | "assemblyai"): SpeechRecognitionProvider {
  if (preferred === "whisper") return whisperSTTProvider;
  if (preferred === "assemblyai") return assemblyAISTTProvider;
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
