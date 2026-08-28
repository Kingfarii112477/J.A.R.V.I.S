import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { executeTool } from "./executor";
import { toolRegistry } from "./registry";
import { registerBuiltinTools } from "./builtins";
import { memoryClient } from "@/lib/memory/client";
import { useJarvisStore, defaultSettings } from "@/store/jarvisStore";

registerBuiltinTools();

const ctx = { sessionId: "test", source: "chat" as const };

beforeEach(() => {
  localStorage.clear();
  useJarvisStore.setState({ settings: { ...defaultSettings, strictToolConfirmation: false } });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("memory_delete tool", () => {
  it("is registered with CONFIRM permission and a risk note", () => {
    const tool = toolRegistry.get("memory_delete");
    expect(tool?.permission).toBe("CONFIRM");
    expect(tool?.riskNote).toMatch(/cannot be undone/i);
  });

  it("requires confirmation before deleting anything", async () => {
    await memoryClient.store({ type: "FACT", content: "The sky is blue.", importance: 0.5, source: "user" });
    const result = await executeTool("memory_delete", { query: "sky" }, ctx, false);
    expect(result.needsConfirmation).toBe(true);
    const stats = await memoryClient.stats();
    expect(stats.total).toBe(1); // nothing deleted yet
  });

  it("deletes the best-matching memory once confirmed", async () => {
    await memoryClient.store({ type: "FACT", content: "The user's favorite color is teal.", importance: 0.7, source: "user" });
    await memoryClient.store({ type: "FACT", content: "Unrelated fact about weather.", importance: 0.3, source: "user" });

    const result = await executeTool("memory_delete", { query: "favorite color" }, ctx, true);
    expect(result.ok).toBe(true);
    expect(result.result).toMatchObject({ found: true, content: expect.stringContaining("favorite color") });

    const stats = await memoryClient.stats();
    expect(stats.total).toBe(1); // only the matched one was removed
  });

  it("reports not found instead of throwing when nothing matches", async () => {
    const result = await executeTool("memory_delete", { query: "nonexistent topic xyz" }, ctx, true);
    expect(result.ok).toBe(true);
    expect(result.result).toEqual({ found: false });
  });
});

describe("get_workflow_status tool", () => {
  it("is registered as SAFE (never requires confirmation)", () => {
    expect(toolRegistry.get("get_workflow_status")?.permission).toBe("SAFE");
  });

  it("reports unavailable honestly when workflow status polling isn't configured", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ status: 501, ok: false, json: async () => ({ unavailable: true }) }));
    const result = await executeTool("get_workflow_status", { executionId: "exec-1" }, ctx, false);
    expect(result.ok).toBe(true);
    expect(result.result).toEqual({ available: false });
    expect(result.summary).toMatch(/not configured/i);
  });

  it("returns the real status when configured", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ status: 200, ok: true, json: async () => ({ status: "completed" }) }));
    const result = await executeTool("get_workflow_status", { executionId: "exec-1" }, ctx, false);
    expect(result.ok).toBe(true);
    expect(result.result).toEqual({ available: true, status: "completed" });
  });
});

describe("n8n_workflow tool", () => {
  it("is registered as CONFIRM with a risk note describing real external execution", () => {
    const tool = toolRegistry.get("n8n_workflow");
    expect(tool?.permission).toBe("CONFIRM");
    expect(tool?.riskNote).toMatch(/external automation/i);
  });
});

describe("web_search tool", () => {
  it("is registered as SAFE (never requires confirmation)", () => {
    expect(toolRegistry.get("web_search")?.permission).toBe("SAFE");
  });

  it("preserves source title/url/snippet in the result the model reasons over, not just a count", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        status: 200,
        ok: true,
        json: async () => ({
          results: [
            { title: "J.A.R.V.I.S on Wikipedia", url: "https://en.wikipedia.org/wiki/J.A.R.V.I.S.", snippet: "A fictional AI." },
          ],
        }),
      })
    );
    const result = await executeTool("web_search", { query: "jarvis" }, ctx, false);
    expect(result.ok).toBe(true);
    expect(result.result).toEqual({
      available: true,
      results: [{ title: "J.A.R.V.I.S on Wikipedia", url: "https://en.wikipedia.org/wiki/J.A.R.V.I.S.", snippet: "A fictional AI." }],
    });
    expect(result.summary).toContain("https://en.wikipedia.org/wiki/J.A.R.V.I.S.");
  });

  it("reports unavailable honestly instead of fabricating results when no research provider is configured", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ status: 503, ok: false, json: async () => ({ unavailable: true }) }));
    const result = await executeTool("web_search", { query: "jarvis" }, ctx, false);
    expect(result.ok).toBe(true);
    expect(result.result).toEqual({ available: false, results: [] });
    expect(result.summary).toMatch(/no research provider is configured/i);
  });
});
