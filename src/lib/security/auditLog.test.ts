import { describe, it, expect, beforeEach } from "vitest";
import { logAuditEvent, getRecentAuditEvents, clearAuditLog } from "./auditLog";
import { useJarvisStore, defaultSettings } from "@/store/jarvisStore";

beforeEach(() => {
  localStorage.clear();
  useJarvisStore.setState({ settings: { ...defaultSettings, auditLoggingEnabled: true } });
});

describe("logAuditEvent", () => {
  it("records an event with a timestamp and id", () => {
    const event = logAuditEvent({ type: "TOOL_EXECUTION", source: "chat", result: "success", detail: "calculator" });
    expect(event?.id).toBeTruthy();
    expect(event?.timestamp).toBeGreaterThan(0);
    expect(getRecentAuditEvents()).toHaveLength(1);
  });

  it("does nothing when auditLoggingEnabled is false", () => {
    useJarvisStore.setState({ settings: { ...defaultSettings, auditLoggingEnabled: false } });
    const event = logAuditEvent({ type: "AUTHENTICATION", source: "lock-screen", result: "denied" });
    expect(event).toBeNull();
    expect(getRecentAuditEvents()).toHaveLength(0);
  });

  it("returns events newest-first", () => {
    logAuditEvent({ type: "SETTINGS_CHANGE", source: "settings", result: "success", detail: "first" });
    logAuditEvent({ type: "SETTINGS_CHANGE", source: "settings", result: "success", detail: "second" });
    const events = getRecentAuditEvents();
    expect(events[0].detail).toBe("second");
    expect(events[1].detail).toBe("first");
  });

  it("clearAuditLog empties the log", () => {
    logAuditEvent({ type: "MEMORY_DELETE", source: "app", result: "success" });
    clearAuditLog();
    expect(getRecentAuditEvents()).toHaveLength(0);
  });

  it("respects the limit passed to getRecentAuditEvents", () => {
    for (let i = 0; i < 10; i++) {
      logAuditEvent({ type: "TOOL_EXECUTION", source: "chat", result: "success", detail: `t${i}` });
    }
    expect(getRecentAuditEvents(3)).toHaveLength(3);
  });
});
