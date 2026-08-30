import { describe, it, expect } from "vitest";
import {
  deriveConversationPhase,
  isAudioLeavingDevice,
  isMicrophoneActive,
  type DeriveConversationPhaseParams,
} from "./conversation";
import type { ListeningSnapshot } from "./types";

const standby: ListeningSnapshot = {
  state: "STANDBY",
  suspendReason: "NONE",
  engineId: "porcupine",
  available: true,
  detail: null,
};

const BASE: DeriveConversationPhaseParams = {
  jarvisState: "IDLE",
  listening: standby,
  followUpOpen: false,
  activeToolCalls: 0,
  online: true,
  justWoke: false,
};

describe("deriveConversationPhase", () => {
  it("reports STANDBY when armed and idle", () => {
    expect(deriveConversationPhase(BASE)).toBe("STANDBY");
  });

  it("reports WAKE_DETECTED in the window between the wake word and capture", () => {
    expect(deriveConversationPhase({ ...BASE, justWoke: true })).toBe("WAKE_DETECTED");
  });

  it("reports LISTENING during capture", () => {
    expect(deriveConversationPhase({ ...BASE, jarvisState: "LISTENING" })).toBe("LISTENING");
  });

  it("distinguishes EXECUTING from THINKING using the existing activeToolCalls signal", () => {
    expect(deriveConversationPhase({ ...BASE, jarvisState: "PROCESSING", activeToolCalls: 1 })).toBe("EXECUTING");
    expect(deriveConversationPhase({ ...BASE, jarvisState: "PROCESSING", activeToolCalls: 0 })).toBe("THINKING");
  });

  it("reports SPEAKING while responding", () => {
    expect(deriveConversationPhase({ ...BASE, jarvisState: "SPEAKING" })).toBe("SPEAKING");
  });

  it("reports FOLLOW_UP while the continuation window is open", () => {
    expect(deriveConversationPhase({ ...BASE, followUpOpen: true })).toBe("FOLLOW_UP");
  });

  it("reports OFFLINE when there is no network and no turn in flight", () => {
    expect(deriveConversationPhase({ ...BASE, online: false })).toBe("OFFLINE");
  });

  it("does NOT report OFFLINE over a turn that is genuinely mid-flight", () => {
    // A stale OFFLINE covering a working response would be its own lie —
    // the in-flight state wins.
    for (const state of ["LISTENING", "THINKING", "PROCESSING", "SPEAKING"] as const) {
      expect(deriveConversationPhase({ ...BASE, online: false, jarvisState: state })).not.toBe("OFFLINE");
    }
  });

  it("reports SUSPENDED with the native service's own reason", () => {
    const suspended: ListeningSnapshot = {
      ...standby,
      state: "SUSPENDED",
      suspendReason: "PHONE_CALL",
      detail: "Standby listening paused during a call.",
    };
    expect(deriveConversationPhase({ ...BASE, listening: suspended })).toBe("SUSPENDED");
  });

  it("reports UNAVAILABLE when the native engine can't run", () => {
    const unavailable: ListeningSnapshot = { ...standby, state: "UNAVAILABLE", available: false };
    expect(deriveConversationPhase({ ...BASE, listening: unavailable })).toBe("UNAVAILABLE");
  });

  it("reports UNAVAILABLE when there is no native snapshot at all (browser)", () => {
    expect(deriveConversationPhase({ ...BASE, listening: null })).toBe("UNAVAILABLE");
  });

  it("treats HANDED_OFF as WAKE_DETECTED until a turn actually starts", () => {
    const handedOff: ListeningSnapshot = { ...standby, state: "HANDED_OFF" };
    expect(deriveConversationPhase({ ...BASE, listening: handedOff })).toBe("WAKE_DETECTED");
  });

  it("reports ERROR from the shared state machine", () => {
    expect(deriveConversationPhase({ ...BASE, jarvisState: "ERROR" })).toBe("ERROR");
  });
});

describe("privacy predicates", () => {
  it("counts STANDBY as microphone-active", () => {
    expect(isMicrophoneActive("STANDBY")).toBe(true);
    expect(isMicrophoneActive("LISTENING")).toBe(true);
    expect(isMicrophoneActive("FOLLOW_UP")).toBe(true);
  });

  it("does NOT count STANDBY as audio leaving the device", () => {
    // The single most important assertion in this file: wake-word
    // detection is local, and the indicator must never imply otherwise.
    expect(isAudioLeavingDevice("STANDBY")).toBe(false);
  });

  it("counts real capture as audio leaving the device", () => {
    expect(isAudioLeavingDevice("LISTENING")).toBe(true);
    expect(isAudioLeavingDevice("FOLLOW_UP")).toBe(true);
  });

  it("counts non-listening phases as neither", () => {
    for (const phase of ["SPEAKING", "THINKING", "EXECUTING", "SUSPENDED", "OFFLINE", "UNAVAILABLE", "ERROR"] as const) {
      expect(isMicrophoneActive(phase)).toBe(false);
      expect(isAudioLeavingDevice(phase)).toBe(false);
    }
  });
});
