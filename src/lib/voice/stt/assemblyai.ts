import { ServerSTTProvider } from "./provider";

/** AssemblyAI is Phase 5's primary production STT provider. Concretely
 * this is still the shared batch-upload ServerSTTProvider from provider.ts
 * (see that file's comment on why streaming's real-time WebSocket session
 * isn't implemented here — a documented, deliberate scope decision, not an
 * oversight: the upload/poll round trip already produces a real transcript
 * from a real API in a few seconds, which this consumer-facing app treats
 * as an acceptable latency tradeoff against the real complexity of a
 * persistent bidirectional streaming session). The server route
 * (app/api/voice/transcribe/route.ts) is where the actual AssemblyAI HTTP
 * calls happen — this file only owns the client-side provider identity. */
export const assemblyAISTTProvider = new ServerSTTProvider("assemblyai");
