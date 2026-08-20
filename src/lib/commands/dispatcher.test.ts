import { describe, it, expect, vi, beforeEach } from "vitest";
import { dispatchCommand, AVAILABLE_COMMANDS } from "./dispatcher";
import { useJarvisStore } from "@/store/jarvisStore";

vi.mock("@/lib/diagnostics/run", () => ({
  runFullDiagnostics: vi.fn().mockResolvedValue(97),
  isDiagnosticsRunning: vi.fn().mockReturnValue(false),
}));

beforeEach(() => {
  useJarvisStore.getState().clearTerminal();
  useJarvisStore.getState().clearMessages();
});

describe("dispatchCommand", () => {
  it("returns handled:false for arbitrary conversational text", () => {
    const result = dispatchCommand("tell me a joke about capacitors");
    expect(result.handled).toBe(false);
  });

  it("handles 'help' and lists every documented command", () => {
    const result = dispatchCommand("help");
    expect(result.handled).toBe(true);
    for (const cmd of AVAILABLE_COMMANDS) {
      expect(result.response).toContain(cmd);
    }
  });

  it("is case-insensitive and trims whitespace", () => {
    const result = dispatchCommand("   SYSTEM STATUS   ");
    expect(result.handled).toBe(true);
  });

  it("clears the terminal on 'clear terminal'", () => {
    useJarvisStore.getState().pushTerminalLine({ kind: "output", text: "leftover line" });
    expect(useJarvisStore.getState().terminalLines.length).toBeGreaterThan(0);

    const result = dispatchCommand("clear terminal");

    expect(result.handled).toBe(true);
    expect(useJarvisStore.getState().terminalLines).toHaveLength(0);
  });

  it("reports subsystem status on 'system status'", () => {
    const result = dispatchCommand("system status");
    expect(result.handled).toBe(true);
    expect(result.response).toMatch(/subsystems online/);
    expect(result.response).toContain("Neural Core");
  });

  it("navigates to /diagnostics and kicks off the diagnostics run", async () => {
    const { runFullDiagnostics } = await import("@/lib/diagnostics/run");
    const navigate = vi.fn();

    const result = dispatchCommand("run diagnostics", { navigate });

    expect(result.handled).toBe(true);
    expect(navigate).toHaveBeenCalledWith("/diagnostics");
    expect(runFullDiagnostics).toHaveBeenCalled();
  });

  it("resolves 'open <screen>' aliases to a real route and navigates", () => {
    const navigate = vi.fn();
    const result = dispatchCommand("open memory core", { navigate });
    expect(result.handled).toBe(true);
    expect(navigate).toHaveBeenCalledWith("/memory");
  });

  it("never claims to deploy real autonomous agents", () => {
    const result = dispatchCommand("deploy agents");
    expect(result.handled).toBe(true);
    expect(result.response.toLowerCase()).toMatch(/not|inactive/);
  });

  it("reports memory status using the local memory summary", () => {
    const result = dispatchCommand("memory status");
    expect(result.handled).toBe(true);
    expect(result.response).toMatch(/GB used/);
  });

  it("'status' is an alias for 'system status'", () => {
    const result = dispatchCommand("status");
    expect(result.handled).toBe(true);
    expect(result.response).toMatch(/subsystems online/);
  });

  it("lists the protocol matrix on 'protocols'", () => {
    const result = dispatchCommand("protocols");
    expect(result.handled).toBe(true);
    expect(result.response).toMatch(/Protocol matrix/);
  });

  it("navigates to the Systems screen and gives an honest (non-committal) status on 'open research mode'", () => {
    const navigate = vi.fn();
    const result = dispatchCommand("open research mode", { navigate });
    expect(result.handled).toBe(true);
    expect(navigate).toHaveBeenCalledWith("/systems");
    expect(result.response.toLowerCase()).not.toMatch(/planned interface|future update/);
  });

  it("lists registered tools with their permission level on 'tools'", () => {
    const result = dispatchCommand("tools");
    expect(result.handled).toBe(true);
    expect(result.response).toContain("calculator");
    expect(result.response).toMatch(/\[SAFE\]|\[CONFIRM\]|\[RESTRICTED\]|\[ADMIN\]/);
  });
});
