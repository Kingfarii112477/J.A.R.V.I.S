import { describe, it, expect, vi, afterEach } from "vitest";
import { streamReasoningTurn } from "./providerAdapter";
import type { ReasoningMessage } from "./types";

const provider = { providerId: "openrouter" as const, baseUrl: "https://openrouter.ai/api/v1", apiKey: "test-key", model: "test-model" };
const baseMessages: ReasoningMessage[] = [
  { role: "system", content: "You are J.A.R.V.I.S." },
  { role: "user", content: "hello" },
];

function sseResponse(lines: string[], ok = true, status = 200) {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      for (const line of lines) controller.enqueue(encoder.encode(line));
      controller.close();
    },
  });
  return { ok, status, body, text: async () => "" } as unknown as Response;
}

afterEach(() => {
  vi.restoreAllMocks();
});

async function collect(gen: AsyncGenerator<unknown>) {
  const events = [];
  for await (const e of gen) events.push(e);
  return events;
}

describe("streamReasoningTurn", () => {
  it("streams plain text deltas and a final done event when no tool is called", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        sseResponse([
          `data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n`,
          `data: {"choices":[{"delta":{"content":" there"}}]}\n\n`,
          `data: {"choices":[{"finish_reason":"stop"}]}\n\n`,
          `data: [DONE]\n\n`,
        ])
      )
    );

    const events = await collect(streamReasoningTurn(provider, baseMessages, []));
    expect(events).toEqual([
      { type: "text", delta: "Hello" },
      { type: "text", delta: " there" },
      { type: "done", finishReason: "stop" },
    ]);
  });

  it("accumulates a tool call's argument fragments across multiple chunks and emits it once complete", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        sseResponse([
          `data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","type":"function","function":{"name":"calculator","arguments":""}}]}}]}\n\n`,
          `data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\\"expr"}}]}}]}\n\n`,
          `data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"ession\\":\\"2+2\\"}"}}]}}]}\n\n`,
          `data: {"choices":[{"finish_reason":"tool_calls"}]}\n\n`,
          `data: [DONE]\n\n`,
        ])
      )
    );

    const events = await collect(streamReasoningTurn(provider, baseMessages, []));
    expect(events).toEqual([
      { type: "tool_call", callId: "call_1", toolName: "calculator", args: { expression: "2+2" }, argsRaw: '{"expression":"2+2"}' },
      { type: "done", finishReason: "tool_calls" },
    ]);
  });

  it("emits independent tool calls for two parallel tool_calls in the same turn", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        sseResponse([
          `data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_a","type":"function","function":{"name":"weather","arguments":"{\\"city\\":\\"Paris\\"}"}}]}}]}\n\n`,
          `data: {"choices":[{"delta":{"tool_calls":[{"index":1,"id":"call_b","type":"function","function":{"name":"task_list","arguments":"{}"}}]}}]}\n\n`,
          `data: {"choices":[{"finish_reason":"tool_calls"}]}\n\n`,
          `data: [DONE]\n\n`,
        ])
      )
    );

    const events = await collect(streamReasoningTurn(provider, baseMessages, []));
    expect(events).toHaveLength(3);
    expect(events[0]).toEqual({ type: "tool_call", callId: "call_a", toolName: "weather", args: { city: "Paris" }, argsRaw: '{"city":"Paris"}' });
    expect(events[1]).toEqual({ type: "tool_call", callId: "call_b", toolName: "task_list", args: {}, argsRaw: "{}" });
    expect(events[2]).toEqual({ type: "done", finishReason: "tool_calls" });
  });

  it("emits tool_call_error instead of throwing when the model produces malformed JSON arguments", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        sseResponse([
          `data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","type":"function","function":{"name":"calculator","arguments":"{not valid json"}}]}}]}\n\n`,
          `data: {"choices":[{"finish_reason":"tool_calls"}]}\n\n`,
          `data: [DONE]\n\n`,
        ])
      )
    );

    const events = await collect(streamReasoningTurn(provider, baseMessages, []));
    expect(events).toEqual([
      { type: "tool_call_error", callId: "call_1", toolName: "calculator", message: expect.stringContaining("malformed JSON") },
      { type: "done", finishReason: "tool_calls" },
    ]);
  });

  it("emits an error event (never throws) when the provider responds with a non-OK status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(sseResponse([], false, 401)));
    const events = await collect(streamReasoningTurn(provider, baseMessages, []));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: "error" });
  });

  it("adds an actionable API-key hint when the provider responds 401", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(sseResponse([], false, 401)));
    const events = await collect(streamReasoningTurn(provider, baseMessages, []));
    expect(events[0]).toMatchObject({
      type: "error",
      message: expect.stringMatching(/API key is missing, wrong, or was revoked/i),
    });
  });

  it("emits an error event (never throws) on a network failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    const events = await collect(streamReasoningTurn(provider, baseMessages, []));
    expect(events).toEqual([{ type: "error", message: "network down" }]);
  });

  it("emits an error event (never throws) when the request times out", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new DOMException("The operation was aborted.", "AbortError")));
    const events = await collect(streamReasoningTurn(provider, baseMessages, []));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: "error" });
  });

  it("emits an error event (never throws) when the stream connection drops mid-read", async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.error(new Error("connection reset"));
      },
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, body, text: async () => "" } as unknown as Response));

    const events = await collect(streamReasoningTurn(provider, baseMessages, []));
    expect(events).toEqual([{ type: "error", message: "connection reset" }]);
  });

  it("skips malformed SSE lines instead of crashing the stream", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        sseResponse([
          `data: {not valid json\n\n`,
          `data: {"choices":[{"delta":{"content":"ok"}}]}\n\n`,
          `data: [DONE]\n\n`,
        ])
      )
    );
    const events = await collect(streamReasoningTurn(provider, baseMessages, []));
    expect(events).toEqual([{ type: "text", delta: "ok" }, { type: "done", finishReason: "stop" }]);
  });
});
