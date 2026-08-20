import { describe, it, expect } from "vitest";
import { getSTTProvider } from "./stt";

describe("getSTTProvider", () => {
  it("defaults to the browser provider", () => {
    expect(getSTTProvider().id).toBe("browser");
    expect(getSTTProvider("browser").id).toBe("browser");
  });

  it("resolves whisper and assemblyai to distinct providers", () => {
    expect(getSTTProvider("whisper").id).toBe("whisper");
    expect(getSTTProvider("assemblyai").id).toBe("assemblyai");
  });

  it("returns the same singleton instance across calls", () => {
    expect(getSTTProvider("whisper")).toBe(getSTTProvider("whisper"));
  });

  it("server providers report unsupported when MediaRecorder is unavailable (jsdom has none)", () => {
    expect(getSTTProvider("whisper").isSupported()).toBe(false);
  });
});
