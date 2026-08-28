import { describe, it, expect, beforeEach, vi } from "vitest";
import { z } from "zod";
import { toolRegistry } from "./registry";
import { executeTool } from "./executor";
import { useJarvisStore, defaultSettings } from "@/store/jarvisStore";
import { eventBus } from "@/lib/events/bus";
import type { ToolDefinition } from "@/types/tools";

const ctx = { sessionId: "s1", source: "chat" as const };

beforeEach(() => {
  useJarvisStore.setState({ settings: defaultSettings });
});

describe("executeTool", () => {
  it("returns an error for an unregistered tool", async () => {
    const result = await executeTool("does_not_exist", {}, ctx);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/unknown tool/i);
  });

  it("rejects invalid parameters via zod before executing", async () => {
    const execute = vi.fn();
    toolRegistry.register({
      name: "test_needs_number",
      description: "test",
      parameters: z.object({ n: z.number() }),
      permission: "SAFE",
      requiresConfirmation: false,
      execute,
      formatResult: () => "ok",
    });

    const result = await executeTool("test_needs_number", { n: "not a number" }, ctx);
    expect(result.ok).toBe(false);
    expect(execute).not.toHaveBeenCalled();
  });

  it("runs a SAFE, non-confirmation tool immediately", async () => {
    toolRegistry.register({
      name: "test_safe",
      description: "test",
      parameters: z.object({}),
      permission: "SAFE",
      requiresConfirmation: false,
      execute: async () => ({ value: 42 }),
      formatResult: (r) => `value is ${r.value}`,
    });

    const result = await executeTool("test_safe", {}, ctx);
    expect(result.ok).toBe(true);
    expect(result.summary).toBe("value is 42");
  });

  it("uses the caller-supplied externalCallId instead of generating its own, so tool.completed correlates with the caller's own tool.requested", async () => {
    toolRegistry.register({
      name: "test_external_id",
      description: "test",
      parameters: z.object({}),
      permission: "SAFE",
      requiresConfirmation: false,
      execute: async () => ({ value: 1 }),
      formatResult: () => "ok",
    });

    const completedIds: string[] = [];
    const off = eventBus.on("tool.completed", (p) => completedIds.push(p.callId));

    const result = await executeTool("test_external_id", {}, ctx, false, "model-call-id-42");
    off();

    expect(result.callId).toBe("model-call-id-42");
    expect(completedIds).toEqual(["model-call-id-42"]);
  });

  it("requires confirmation for a CONFIRM-level tool and does not execute until confirmed", async () => {
    const execute = vi.fn().mockResolvedValue({ done: true });
    toolRegistry.register({
      name: "test_confirm",
      description: "test",
      parameters: z.object({}),
      permission: "CONFIRM",
      requiresConfirmation: true,
      execute,
      formatResult: () => "done",
    });

    const first = await executeTool("test_confirm", {}, ctx);
    expect(first.needsConfirmation).toBe(true);
    expect(execute).not.toHaveBeenCalled();

    const second = await executeTool("test_confirm", {}, ctx, true);
    expect(second.ok).toBe(true);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("requires confirmation for ANY tool when strictToolConfirmation is on, even SAFE ones", async () => {
    useJarvisStore.setState({ settings: { ...defaultSettings, strictToolConfirmation: true } });
    const execute = vi.fn().mockResolvedValue({});
    toolRegistry.register({
      name: "test_strict",
      description: "test",
      parameters: z.object({}),
      permission: "SAFE",
      requiresConfirmation: false,
      execute,
      formatResult: () => "ok",
    });

    const result = await executeTool("test_strict", {}, ctx);
    expect(result.needsConfirmation).toBe(true);
    expect(execute).not.toHaveBeenCalled();
  });

  it("surfaces a thrown error from execute() as a failed result, not an unhandled rejection", async () => {
    toolRegistry.register({
      name: "test_throws",
      description: "test",
      parameters: z.object({}),
      permission: "SAFE",
      requiresConfirmation: false,
      execute: async () => {
        throw new Error("boom");
      },
      formatResult: () => "unreachable",
    });

    const result = await executeTool("test_throws", {}, ctx);
    expect(result.ok).toBe(false);
    expect(result.error).toBe("boom");
  });

  it("never allows RESTRICTED/ADMIN tools to run without confirmation regardless of requiresConfirmation flag", async () => {
    const execute: ToolDefinition["execute"] = vi.fn().mockResolvedValue({});
    toolRegistry.register({
      name: "test_admin",
      description: "test",
      parameters: z.object({}),
      permission: "ADMIN",
      requiresConfirmation: false, // even if a tool author forgets this, permission alone should still gate it
      execute,
      formatResult: () => "ok",
    });

    const result = await executeTool("test_admin", {}, ctx);
    expect(result.needsConfirmation).toBe(true);
    expect(execute).not.toHaveBeenCalled();
  });
});
