import { describe, it, expect, afterEach } from "vitest";
import { AZURE_VOICE_PROFILES, voiceProfileForLanguage, resolveAzureVoice, localeForAzureVoice } from "./voiceProfiles";

describe("voiceProfileForLanguage", () => {
  it("maps every supported language to a profile", () => {
    expect(voiceProfileForLanguage("en")).toBe("english");
    expect(voiceProfileForLanguage("ur")).toBe("urdu");
    expect(voiceProfileForLanguage("hi")).toBe("hindi");
    expect(voiceProfileForLanguage("roman-ur")).toBe("romanUrdu");
    expect(voiceProfileForLanguage("hinglish")).toBe("hinglish");
    expect(voiceProfileForLanguage("mixed")).toBe("default");
  });

  it("falls back to default when no language is given", () => {
    expect(voiceProfileForLanguage(undefined)).toBe("default");
  });
});

describe("resolveAzureVoice", () => {
  const originalEnv = process.env.AZURE_SPEECH_VOICE;
  afterEach(() => {
    process.env.AZURE_SPEECH_VOICE = originalEnv;
  });

  it("uses the profile's default voice when no override is set", () => {
    delete process.env.AZURE_SPEECH_VOICE;
    expect(resolveAzureVoice("urdu")).toBe(AZURE_VOICE_PROFILES.urdu);
  });

  it("an explicit AZURE_SPEECH_VOICE env var always wins", () => {
    process.env.AZURE_SPEECH_VOICE = "en-US-JennyNeural";
    expect(resolveAzureVoice("hindi")).toBe("en-US-JennyNeural");
  });

  it("routes Roman Urdu and Hinglish to the English voice, never a native-script voice", () => {
    expect(AZURE_VOICE_PROFILES.romanUrdu).toBe(AZURE_VOICE_PROFILES.english);
    expect(AZURE_VOICE_PROFILES.hinglish).toBe(AZURE_VOICE_PROFILES.english);
  });
});

describe("localeForAzureVoice", () => {
  it("derives the SSML xml:lang from the voice name's own prefix", () => {
    expect(localeForAzureVoice("en-GB-RyanNeural")).toBe("en-GB");
    expect(localeForAzureVoice("ur-PK-AsadNeural")).toBe("ur-PK");
    expect(localeForAzureVoice("hi-IN-MadhurNeural")).toBe("hi-IN");
  });

  it("falls back to en-US for a malformed voice name", () => {
    expect(localeForAzureVoice("weird")).toBe("en-US");
  });
});
