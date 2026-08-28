import { ServerTTSProvider } from "./provider";

/** Azure AI Speech is Phase 5's primary production TTS provider. The
 * actual Azure REST call (SSML construction, voice selection by detected
 * language) happens server-side in app/api/voice/speak/route.ts — this
 * file only owns the client-side provider identity, matching
 * stt/assemblyai.ts's split. */
export const azureTTSProvider = new ServerTTSProvider("azure");
