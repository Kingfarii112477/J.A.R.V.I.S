import { describe, it, expect } from "vitest";
import { deriveVoiceState, type DeriveVoiceStateParams } from "./state";

function base(overrides: Partial<DeriveVoiceStateParams> = {}): DeriveVoiceStateParams {
  return { jarvisState: "IDLE", supported: true, requestingPermission: false, justInterrupted: false, activeToolCalls: 0, ...overrides };
}

describe("deriveVoiceState", () => {
  it("returns UNAVAILABLE when speech recognition isn't supported, regardless of anything else", () => {
    expect(deriveVoiceState(base({ supported: false, jarvisState: "LISTENING" }))).toBe("UNAVAILABLE");
  });

  it("returns REQUESTING_PERMISSION while the mic permission prompt is pending", () => {
    expect(deriveVoiceState(base({ requestingPermission: true }))).toBe("REQUESTING_PERMISSION");
  });

  it("returns INTERRUPTED momentarily after a barge-in, taking priority over the underlying jarvisState", () => {
    expect(deriveVoiceState(base({ justInterrupted: true, jarvisState: "SPEAKING" }))).toBe("INTERRUPTED");
  });

  it("maps LISTENING/THINKING/SPEAKING/ERROR/IDLE straightforwardly", () => {
    expect(deriveVoiceState(base({ jarvisState: "LISTENING" }))).toBe("LISTENING");
    expect(deriveVoiceState(base({ jarvisState: "THINKING" }))).toBe("REASONING");
    expect(deriveVoiceState(base({ jarvisState: "SPEAKING" }))).toBe("SPEAKING");
    expect(deriveVoiceState(base({ jarvisState: "ERROR" }))).toBe("ERROR");
    expect(deriveVoiceState(base({ jarvisState: "IDLE" }))).toBe("IDLE");
  });

  it("maps WARNING to WAITING_CONFIRMATION (reusing the existing confirmation-pulse state)", () => {
    expect(deriveVoiceState(base({ jarvisState: "WARNING" }))).toBe("WAITING_CONFIRMATION");
  });

  it("tells PROCESSING and EXECUTING_TOOL apart using the active-tool-call counter", () => {
    expect(deriveVoiceState(base({ jarvisState: "PROCESSING", activeToolCalls: 0 }))).toBe("PROCESSING");
    expect(deriveVoiceState(base({ jarvisState: "PROCESSING", activeToolCalls: 1 }))).toBe("EXECUTING_TOOL");
  });

  it("falls back to IDLE for any unmapped jarvisState (BOOTING, DIAGNOSTICS, OFFLINE)", () => {
    expect(deriveVoiceState(base({ jarvisState: "BOOTING" }))).toBe("IDLE");
    expect(deriveVoiceState(base({ jarvisState: "DIAGNOSTICS" }))).toBe("IDLE");
    expect(deriveVoiceState(base({ jarvisState: "OFFLINE" }))).toBe("IDLE");
  });
});
