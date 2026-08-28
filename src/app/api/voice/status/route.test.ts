import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { GET } from "./route";

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  for (const key of ["OPENAI_API_KEY", "ASSEMBLYAI_API_KEY", "ELEVENLABS_API_KEY", "AZURE_SPEECH_KEY", "AZURE_SPEECH_REGION"]) {
    delete process.env[key];
  }
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("GET /api/voice/status", () => {
  it("reports every provider as unavailable when nothing is configured", async () => {
    const res = await GET();
    expect(await res.json()).toEqual({
      stt: { whisper: { available: false }, assemblyai: { available: false } },
      tts: { openai: { available: false }, elevenlabs: { available: false }, azure: { available: false } },
    });
  });

  it("reports assemblyai/azure available once their keys are set, and never echoes the key values", async () => {
    process.env.ASSEMBLYAI_API_KEY = "aai-super-secret-key";
    process.env.AZURE_SPEECH_KEY = "azure-super-secret-key";
    process.env.AZURE_SPEECH_REGION = "centralindia";

    const res = await GET();
    const bodyText = await res.text();
    const body = JSON.parse(bodyText);

    expect(body.stt.assemblyai).toEqual({ available: true });
    expect(body.tts.azure).toEqual({ available: true });
    expect(bodyText).not.toContain("aai-super-secret-key");
    expect(bodyText).not.toContain("azure-super-secret-key");
  });

  it("requires BOTH AZURE_SPEECH_KEY and AZURE_SPEECH_REGION for azure to read as available", async () => {
    process.env.AZURE_SPEECH_KEY = "azure-super-secret-key";
    const res = await GET();
    expect((await res.json()).tts.azure).toEqual({ available: false });
  });

  it("OPENAI_API_KEY makes both whisper (stt) and openai (tts) available, since they share one key", async () => {
    process.env.OPENAI_API_KEY = "sk-super-secret-openai-key";
    const res = await GET();
    const body = await res.json();
    expect(body.stt.whisper).toEqual({ available: true });
    expect(body.tts.openai).toEqual({ available: true });
  });
});
