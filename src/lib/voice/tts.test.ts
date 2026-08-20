import { describe, it, expect } from "vitest";
import { getTTSProvider, browserTTSProvider } from "./tts";

describe("getTTSProvider", () => {
  it("defaults to the browser provider", () => {
    expect(getTTSProvider().id).toBe("browser");
    expect(getTTSProvider("browser")).toBe(browserTTSProvider);
  });

  it("resolves openai and elevenlabs to distinct providers", () => {
    expect(getTTSProvider("openai").id).toBe("openai");
    expect(getTTSProvider("elevenlabs").id).toBe("elevenlabs");
  });

  it("returns the same singleton instance across calls", () => {
    expect(getTTSProvider("elevenlabs")).toBe(getTTSProvider("elevenlabs"));
  });

  it("cancel() on a provider that was never asked to speak is a harmless no-op", () => {
    expect(() => getTTSProvider("openai").cancel()).not.toThrow();
  });
});
