import type { SpeechRecognitionProvider, STTOptions } from "./types";

/** Records audio with MediaRecorder and uploads it to /api/voice/transcribe
 * on stop() for batch transcription (Whisper or AssemblyAI — whichever the
 * server has an API key for). There's no true interim-results stream with
 * a batch upload, so this only ever reports a single final result; the
 * caller sees an honest "unavailable" error (rather than a fabricated
 * transcript) if the server has no key configured for this provider.
 *
 * Shared base for every server-proxied STT provider — see assemblyai.ts —
 * rather than one class per upstream API, since the upload/poll shape is
 * identical and only the `provider` field posted to the route differs. */
export class ServerSTTProvider implements SpeechRecognitionProvider {
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
      opts.onResult({ transcript: data.transcript ?? "", isFinal: true, confidence: data.confidence, detectedLanguageCode: data.detectedLanguageCode });
    } catch {
      opts.onError?.("Could not reach the transcription service.", "error");
    } finally {
      opts.onEnd?.();
    }
  }
}
