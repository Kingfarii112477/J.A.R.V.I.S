import { describe, it, expect } from "vitest";
import { getTTSProvider } from "./manager";
import { browserTTSProvider } from "./fallback";

describe("getTTSProvider", () => {
  it("defaults to the browser provider", () => {
    expect(getTTSProvider().id).toBe("browser");
    expect(getTTSProvider("browser")).toBe(browserTTSProvider);
  });

  it("resolves openai, elevenlabs, and azure to distinct providers", () => {
    expect(getTTSProvider("openai").id).toBe("openai");
    expect(getTTSProvider("elevenlabs").id).toBe("elevenlabs");
    expect(getTTSProvider("azure").id).toBe("azure");
  });

  it("returns the same singleton instance across calls", () => {
    expect(getTTSProvider("elevenlabs")).toBe(getTTSProvider("elevenlabs"));
    expect(getTTSProvider("azure")).toBe(getTTSProvider("azure"));
  });

  it("cancel() on a provider that was never asked to speak is a harmless no-op", () => {
    expect(() => getTTSProvider("openai").cancel()).not.toThrow();
    expect(() => getTTSProvider("azure").cancel()).not.toThrow();
  });
});
