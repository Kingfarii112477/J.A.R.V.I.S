import { describe, it, expect, vi, beforeEach } from "vitest";
import { ReasoningEngine, type ReasoningRequestInput, type ReasoningCallbacks } from "./engine";
import type { ReasoningStreamEvent } from "./types";

vi.mock("./client", () => ({ streamReasoningEndpoint: vi.fn() }));
vi.mock("@/lib/tools", () => ({ executeTool: vi.fn() }));

import { streamReasoningEndpoint } from "./client";
import { executeTool } from "@/lib/tools";

const mockStream = vi.mocked(streamReasoningEndpoint);
const mockExecuteTool = vi.mocked(executeTool);

function decisionStream(events: ReasoningStreamEvent[]): AsyncGenerator<ReasoningStreamEvent, void, unknown> {
  return (async function* () {
    for (const e of events) yield e;
  })();
}

function baseInput(overrides: Partial<ReasoningRequestInput> = {}): ReasoningRequestInput {
  return {
    userText: "hello",
    sessionId: "sess-1",
    screen: "chat",
    jarvisState: "IDLE",
    verbosity: "balanced",
    retrievedMemories: [],
    history: [],
    ...overrides,
  };
}

function baseCallbacks(overrides: Partial<ReasoningCallbacks> = {}): ReasoningCallbacks {
  return {
    onToolCallStart: vi.fn(),
    onToolCallResult: vi.fn(),
    onNeedsConfirmation: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

const toolCtx = { sessionId: "sess-1", source: "chat" as const };

beforeEach(() => {
  mockStream.mockReset();
  mockExecuteTool.mockReset();
});

describe("ReasoningEngine", () => {
  it("falls back cleanly when no tool-calling-capable provider is configured", async () => {
    mockStream.mockReturnValue(decisionStream([{ type: "fallback" }]));
    const engine = new ReasoningEngine();
    const result = await engine.run(baseInput(), toolCtx, baseCallbacks());
    expect(result.usedReasoning).toBe(false);
    expect(mockExecuteTool).not.toHaveBeenCalled();
  });

  it("returns a plain final answer immediately when the model needs no tools", async () => {
    mockStream.mockReturnValue(decisionStream([{ type: "text", delta: "Hi there." }, { type: "done", finishReason: "stop" }]));
    const engine = new ReasoningEngine();
    const result = await engine.run(baseInput(), toolCtx, baseCallbacks());
    expect(result.stoppedReason).toBe("complete");
    expect(result.finalText).toBe("Hi there.");
    expect(result.iterations).toBe(1);
    expect(result.toolCallCount).toBe(0);
  });

  it("executes a single tool call and reasons over the real result to produce a final answer", async () => {
    mockStream
      .mockReturnValueOnce(
        decisionStream([
          { type: "tool_call", callId: "c1", toolName: "system_status", args: {}, argsRaw: "{}" },
          { type: "done", finishReason: "tool_calls" },
        ])
      )
      .mockReturnValueOnce(decisionStream([{ type: "text", delta: "All systems nominal." }, { type: "done", finishReason: "stop" }]));
    mockExecuteTool.mockResolvedValue({ ok: true, callId: "c1", toolName: "system_status", result: { online: 6, total: 6 }, summary: "6/6 online." });

    const callbacks = baseCallbacks();
    const engine = new ReasoningEngine();
    const result = await engine.run(baseInput({ userText: "is everything ok?" }), toolCtx, callbacks);

    expect(mockExecuteTool).toHaveBeenCalledTimes(1);
    expect(mockExecuteTool).toHaveBeenCalledWith("system_status", {}, toolCtx, false, "c1");
    expect(callbacks.onToolCallStart).toHaveBeenCalledWith({ callId: "c1", toolName: "system_status", args: {} });
    expect(callbacks.onToolCallResult).toHaveBeenCalledWith("c1", expect.objectContaining({ ok: true }));
    expect(result.stoppedReason).toBe("complete");
    expect(result.finalText).toBe("All systems nominal.");
    expect(result.iterations).toBe(2);
    expect(result.toolCallCount).toBe(1);
  });

  it("reasons over real research results, injecting their full source metadata back into the model's context", async () => {
    mockStream
      .mockReturnValueOnce(
        decisionStream([
          { type: "tool_call", callId: "c1", toolName: "web_search", args: { query: "jarvis ai" }, argsRaw: "{}" },
          { type: "done", finishReason: "tool_calls" },
        ])
      )
      .mockReturnValueOnce(decisionStream([{ type: "text", delta: "Per Wikipedia, J.A.R.V.I.S. is a fictional AI." }, { type: "done", finishReason: "stop" }]));
    mockExecuteTool.mockResolvedValue({
      ok: true,
      callId: "c1",
      toolName: "web_search",
      result: { available: true, results: [{ title: "J.A.R.V.I.S. (Wikipedia)", url: "https://en.wikipedia.org/wiki/J.A.R.V.I.S.", snippet: "A fictional AI." }] },
      summary: 'Found 1 result: "J.A.R.V.I.S. (Wikipedia)" (https://en.wikipedia.org/wiki/J.A.R.V.I.S.)',
    });

    const engine = new ReasoningEngine();
    const result = await engine.run(baseInput({ userText: "who is jarvis" }), toolCtx, baseCallbacks());

    // The second model turn must have received the tool's full source
    // metadata (not just a bare success flag) — otherwise the model has
    // nothing real to summarize and would have to fabricate an answer.
    const secondCallMessages = mockStream.mock.calls[1][0] as { role: string; content?: string }[];
    const toolMessage = secondCallMessages.find((m) => m.role === "tool");
    expect(toolMessage?.content).toContain("https://en.wikipedia.org/wiki/J.A.R.V.I.S.");
    expect(toolMessage?.content).toContain("A fictional AI.");
    expect(result.stoppedReason).toBe("complete");
    expect(result.finalText).toBe("Per Wikipedia, J.A.R.V.I.S. is a fictional AI.");
  });

  it("chains sequential tool calls across iterations (second call informed by the first result)", async () => {
    mockStream
      .mockReturnValueOnce(decisionStream([{ type: "tool_call", callId: "c1", toolName: "system_status", args: {}, argsRaw: "{}" }, { type: "done", finishReason: "tool_calls" }]))
      .mockReturnValueOnce(decisionStream([{ type: "tool_call", callId: "c2", toolName: "run_diagnostics", args: {}, argsRaw: "{}" }, { type: "done", finishReason: "tool_calls" }]))
      .mockReturnValueOnce(decisionStream([{ type: "text", delta: "Health was low, so I ran diagnostics — now at 97%." }, { type: "done", finishReason: "stop" }]));
    mockExecuteTool
      .mockResolvedValueOnce({ ok: true, callId: "c1", toolName: "system_status", result: { health: 40 }, summary: "Health low." })
      .mockResolvedValueOnce({ ok: true, callId: "c2", toolName: "run_diagnostics", result: { score: 97 }, summary: "Diagnostics complete." });

    const engine = new ReasoningEngine();
    const result = await engine.run(baseInput({ userText: "check status and fix if needed" }), toolCtx, baseCallbacks());

    expect(mockExecuteTool).toHaveBeenCalledTimes(2);
    expect(result.iterations).toBe(3);
    expect(result.toolCallCount).toBe(2);
    expect(result.stoppedReason).toBe("complete");
  });

  it("executes independent same-turn tool calls in parallel, not sequentially", async () => {
    mockStream
      .mockReturnValueOnce(
        decisionStream([
          { type: "tool_call", callId: "c1", toolName: "weather", args: { city: "Paris" }, argsRaw: "{}" },
          { type: "tool_call", callId: "c2", toolName: "task_list", args: {}, argsRaw: "{}" },
          { type: "done", finishReason: "tool_calls" },
        ])
      )
      .mockReturnValueOnce(decisionStream([{ type: "text", delta: "Weather and tasks summarized." }, { type: "done", finishReason: "stop" }]));

    const order: string[] = [];
    mockExecuteTool.mockImplementation(async (toolName) => {
      order.push(`${String(toolName)}:start`);
      const delay = toolName === "weather" ? 40 : 0;
      await new Promise((r) => setTimeout(r, delay));
      order.push(`${String(toolName)}:end`);
      return { ok: true, callId: toolName === "weather" ? "c1" : "c2", toolName: String(toolName), result: {}, summary: "ok" };
    });

    const start = Date.now();
    const engine = new ReasoningEngine();
    await engine.run(baseInput({ userText: "weather and tasks" }), toolCtx, baseCallbacks());
    const elapsed = Date.now() - start;

    // Both tools started before either finished — proof they ran concurrently.
    expect(order.indexOf("weather:start")).toBeLessThan(order.indexOf("weather:end"));
    expect(order.indexOf("task_list:start")).toBeLessThan(order.indexOf("weather:end"));
    // If they'd run sequentially this would take >= 40ms twice; concurrent
    // execution keeps it close to the single 40ms delay.
    expect(elapsed).toBeLessThan(80);
  });

  it("surfaces a tool failure to the model instead of crashing the run", async () => {
    mockStream
      .mockReturnValueOnce(decisionStream([{ type: "tool_call", callId: "c1", toolName: "weather", args: { city: "Nowhere" }, argsRaw: "{}" }, { type: "done", finishReason: "tool_calls" }]))
      .mockReturnValueOnce(decisionStream([{ type: "text", delta: "I couldn't get the weather for that city." }, { type: "done", finishReason: "stop" }]));
    mockExecuteTool.mockResolvedValue({ ok: false, callId: "c1", toolName: "weather", error: "City not found." });

    const failedEvents: string[] = [];
    const { eventBus } = await import("@/lib/events/bus");
    const off = eventBus.on("tool.failed", (p) => failedEvents.push(p.toolName));

    const engine = new ReasoningEngine();
    const result = await engine.run(baseInput({ userText: "weather in nowhere" }), toolCtx, baseCallbacks());

    off();
    expect(result.stoppedReason).toBe("complete");
    expect(failedEvents).toEqual(["weather"]);
  });

  it("pauses on a CONFIRM-level tool and only executes for real once the user authorizes", async () => {
    mockStream
      .mockReturnValueOnce(decisionStream([{ type: "tool_call", callId: "c1", toolName: "memory_delete", args: { id: "mem-1" }, argsRaw: "{}" }, { type: "done", finishReason: "tool_calls" }]))
      .mockReturnValueOnce(decisionStream([{ type: "text", delta: "Deleted as authorized." }, { type: "done", finishReason: "stop" }]));
    mockExecuteTool
      .mockResolvedValueOnce({ ok: false, callId: "c1", toolName: "memory_delete", needsConfirmation: true })
      .mockResolvedValueOnce({ ok: true, callId: "c1", toolName: "memory_delete", result: { deleted: true }, summary: "Deleted." });

    const onNeedsConfirmation = vi.fn().mockResolvedValue(true);
    const engine = new ReasoningEngine();
    const result = await engine.run(baseInput({ userText: "delete that memory" }), toolCtx, baseCallbacks({ onNeedsConfirmation }));

    expect(onNeedsConfirmation).toHaveBeenCalledWith({ callId: "c1", toolName: "memory_delete", args: { id: "mem-1" } });
    expect(mockExecuteTool).toHaveBeenNthCalledWith(1, "memory_delete", { id: "mem-1" }, toolCtx, false, "c1");
    expect(mockExecuteTool).toHaveBeenNthCalledWith(2, "memory_delete", { id: "mem-1" }, toolCtx, true, "c1");
    expect(result.stoppedReason).toBe("complete");
  });

  it("never bypasses permission — a cancelled confirmation is never executed for real", async () => {
    mockStream
      .mockReturnValueOnce(decisionStream([{ type: "tool_call", callId: "c1", toolName: "memory_delete", args: { id: "mem-1" }, argsRaw: "{}" }, { type: "done", finishReason: "tool_calls" }]))
      .mockReturnValueOnce(decisionStream([{ type: "text", delta: "Understood, I won't delete it." }, { type: "done", finishReason: "stop" }]));
    mockExecuteTool.mockResolvedValueOnce({ ok: false, callId: "c1", toolName: "memory_delete", needsConfirmation: true });

    const onNeedsConfirmation = vi.fn().mockResolvedValue(false);
    const callbacks = baseCallbacks({ onNeedsConfirmation });
    const engine = new ReasoningEngine();
    await engine.run(baseInput({ userText: "delete that memory" }), toolCtx, callbacks);

    expect(mockExecuteTool).toHaveBeenCalledTimes(1); // never called a second (confirmed) time
    expect(callbacks.onToolCallResult).toHaveBeenCalledWith(
      "c1",
      expect.objectContaining({ ok: false, cancelled: true, error: expect.stringContaining("not granted") })
    );
  });

  it("continues reasoning over a partial result when one of several parallel tool calls fails", async () => {
    mockStream
      .mockReturnValueOnce(
        decisionStream([
          { type: "tool_call", callId: "c1", toolName: "weather", args: { city: "Paris" }, argsRaw: "{}" },
          { type: "tool_call", callId: "c2", toolName: "task_list", args: {}, argsRaw: "{}" },
          { type: "done", finishReason: "tool_calls" },
        ])
      )
      .mockReturnValueOnce(decisionStream([{ type: "text", delta: "I got your tasks, but the weather lookup failed." }, { type: "done", finishReason: "stop" }]));
    mockExecuteTool.mockImplementation(async (toolName) => {
      if (toolName === "weather") return { ok: false, callId: "c1", toolName: "weather", error: "City not found." };
      return { ok: true, callId: "c2", toolName: "task_list", result: { count: 2 }, summary: "2 open tasks." };
    });

    const callbacks = baseCallbacks();
    const engine = new ReasoningEngine();
    const result = await engine.run(baseInput({ userText: "weather and tasks" }), toolCtx, callbacks);

    // The run doesn't crash or stop early on a partial failure — both
    // results are folded back in and reasoning continues to completion.
    expect(mockExecuteTool).toHaveBeenCalledTimes(2);
    expect(callbacks.onToolCallResult).toHaveBeenCalledWith("c1", expect.objectContaining({ ok: false }));
    expect(callbacks.onToolCallResult).toHaveBeenCalledWith("c2", expect.objectContaining({ ok: true }));
    expect(result.stoppedReason).toBe("complete");
    expect(result.finalText).toBe("I got your tasks, but the weather lookup failed.");
  });

  it("stops cleanly and skips the model call entirely when the caller has already aborted (user pressed STOP)", async () => {
    const controller = new AbortController();
    controller.abort();
    mockStream.mockReturnValue(decisionStream([{ type: "text", delta: "..." }, { type: "done", finishReason: "stop" }]));

    const engine = new ReasoningEngine();
    const result = await engine.run(baseInput(), toolCtx, baseCallbacks(), { signal: controller.signal });

    expect(result.stoppedReason).toBe("aborted");
    expect(mockStream).not.toHaveBeenCalled();
  });

  it("stops after maxIterations rather than looping forever", async () => {
    mockStream.mockImplementation(() =>
      decisionStream([{ type: "tool_call", callId: `c${Math.random()}`, toolName: "task_list", args: {}, argsRaw: "{}" }, { type: "done", finishReason: "tool_calls" }])
    );
    mockExecuteTool.mockResolvedValue({ ok: true, callId: "c", toolName: "task_list", result: {}, summary: "ok" });

    const engine = new ReasoningEngine();
    const result = await engine.run(baseInput(), toolCtx, baseCallbacks(), { maxIterations: 2 });

    expect(result.stoppedReason).toBe("limit_iterations");
    expect(result.iterations).toBe(2);
  });

  it("stops once the total tool-call budget is exhausted rather than executing unbounded calls", async () => {
    mockStream
      .mockReturnValueOnce(
        decisionStream([
          { type: "tool_call", callId: "c1", toolName: "task_list", args: {}, argsRaw: "{}" },
          { type: "tool_call", callId: "c2", toolName: "task_list", args: {}, argsRaw: "{}" },
          { type: "done", finishReason: "tool_calls" },
        ])
      )
      .mockReturnValueOnce(decisionStream([{ type: "tool_call", callId: "c3", toolName: "task_list", args: {}, argsRaw: "{}" }, { type: "done", finishReason: "tool_calls" }]));
    mockExecuteTool.mockResolvedValue({ ok: true, callId: "c1", toolName: "task_list", result: {}, summary: "ok" });

    const engine = new ReasoningEngine();
    const result = await engine.run(baseInput(), toolCtx, baseCallbacks(), { maxToolCalls: 1 });

    expect(mockExecuteTool).toHaveBeenCalledTimes(1); // only the first call in the budget ever ran
    expect(result.stoppedReason).toBe("limit_tools");
    expect(result.toolCallCount).toBe(1);
  });

  it("stops on timeout between iterations rather than running forever", async () => {
    mockStream.mockImplementation(() =>
      (async function* () {
        await new Promise((r) => setTimeout(r, 25));
        yield { type: "tool_call" as const, callId: "c1", toolName: "task_list", args: {}, argsRaw: "{}" };
        yield { type: "done" as const, finishReason: "tool_calls" as const };
      })()
    );
    mockExecuteTool.mockResolvedValue({ ok: true, callId: "c1", toolName: "task_list", result: {}, summary: "ok" });

    const engine = new ReasoningEngine();
    const result = await engine.run(baseInput(), toolCtx, baseCallbacks(), { timeoutMs: 10, maxIterations: 10 });

    expect(result.stoppedReason).toBe("timeout");
  });

  it("times out a single hung tool rather than blocking the whole run", async () => {
    mockStream
      .mockReturnValueOnce(decisionStream([{ type: "tool_call", callId: "c1", toolName: "n8n_workflow", args: {}, argsRaw: "{}" }, { type: "done", finishReason: "tool_calls" }]))
      .mockReturnValueOnce(decisionStream([{ type: "text", delta: "That workflow is taking too long." }, { type: "done", finishReason: "stop" }]));
    mockExecuteTool.mockImplementation(() => new Promise(() => {})); // never resolves

    const engine = new ReasoningEngine();
    const result = await engine.run(baseInput(), toolCtx, baseCallbacks(), { toolTimeoutMs: 15 });

    expect(result.stoppedReason).toBe("complete");
  });

  it("handles a malformed model tool call without crashing the run", async () => {
    mockStream
      .mockReturnValueOnce(
        decisionStream([
          { type: "tool_call_error", callId: "c1", toolName: "calculator", message: "Model produced malformed JSON arguments." },
          { type: "done", finishReason: "tool_calls" },
        ])
      )
      .mockReturnValueOnce(decisionStream([{ type: "text", delta: "Let me try that differently." }, { type: "done", finishReason: "stop" }]));

    const engine = new ReasoningEngine();
    const result = await engine.run(baseInput(), toolCtx, baseCallbacks());

    expect(mockExecuteTool).not.toHaveBeenCalled(); // never attempted with malformed args
    expect(result.stoppedReason).toBe("complete");
  });

  it("returns a clean error result instead of throwing on a provider error event", async () => {
    mockStream.mockReturnValue(decisionStream([{ type: "error", message: "Upstream 500." }]));
    const engine = new ReasoningEngine();
    const result = await engine.run(baseInput(), toolCtx, baseCallbacks());
    expect(result.stoppedReason).toBe("error");
    expect(result.errorMessage).toBe("Upstream 500.");
  });

  it("does nothing for an empty request rather than spending a model call", async () => {
    const engine = new ReasoningEngine();
    const result = await engine.run(baseInput({ userText: "   " }), toolCtx, baseCallbacks());
    expect(mockStream).not.toHaveBeenCalled();
    expect(result.stoppedReason).toBe("error");
  });

  it("emits reasoning.started with the classified intent for observability", async () => {
    mockStream.mockReturnValue(decisionStream([{ type: "text", delta: "Sure." }, { type: "done", finishReason: "stop" }]));
    const { eventBus } = await import("@/lib/events/bus");
    const started: { text: string; intent: string }[] = [];
    const off = eventBus.on("reasoning.started", (p) => started.push({ text: p.text, intent: p.intent }));

    const engine = new ReasoningEngine();
    await engine.run(baseInput({ userText: "check the system status please" }), toolCtx, baseCallbacks());

    off();
    expect(started).toEqual([{ text: "check the system status please", intent: "SYSTEM" }]);
  });

  it("emits reasoning.completed with intent and provider/model on a normal completion", async () => {
    mockStream.mockReturnValue(decisionStream([{ type: "text", delta: "Done." }, { type: "done", finishReason: "stop" }]));
    const { eventBus } = await import("@/lib/events/bus");
    const completed: unknown[] = [];
    const off = eventBus.on("reasoning.completed", (p) => completed.push(p));

    const engine = new ReasoningEngine();
    await engine.run(baseInput(), toolCtx, baseCallbacks());

    off();
    expect(completed).toHaveLength(1);
    expect(completed[0]).toMatchObject({ intent: "CONVERSATION", stoppedReason: "complete", providerId: null, model: null });
  });

  it("also emits reasoning.completed (stoppedReason: fallback) when no provider is configured", async () => {
    mockStream.mockReturnValue(decisionStream([{ type: "fallback" }]));
    const { eventBus } = await import("@/lib/events/bus");
    const completed: unknown[] = [];
    const off = eventBus.on("reasoning.completed", (p) => completed.push(p));

    const engine = new ReasoningEngine();
    await engine.run(baseInput(), toolCtx, baseCallbacks());

    off();
    expect(completed).toHaveLength(1);
    expect(completed[0]).toMatchObject({ stoppedReason: "fallback" });
  });
});
