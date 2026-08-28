import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { POST } from "./route";

const validBody = {
  messages: [
    { role: "system", content: "You are J.A.R.V.I.S." },
    { role: "user", content: "hello" },
  ],
  tools: [],
  sessionId: "test-session",
};

function req(body: unknown, headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/reasoning", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

async function readNdjson(res: Response) {
  const text = await res.text();
  return text
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  for (const key of ["OPENROUTER_API_KEY", "GROQ_API_KEY", "OPENAI_COMPATIBLE_API_KEY", "OPENAI_COMPATIBLE_BASE_URL"]) {
    delete process.env[key];
  }
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.restoreAllMocks();
});

describe("POST /api/reasoning", () => {
  it("rejects an invalid request body", async () => {
    const res = await POST(req({ nonsense: true }));
    expect(res.status).toBe(400);
  });

  it("emits a single fallback event when no tool-calling provider is configured", async () => {
    const res = await POST(req(validBody));
    expect(res.status).toBe(200);
    const events = await readNdjson(res);
    expect(events).toEqual([{ type: "fallback" }]);
  });

  it("streams provider events when OPENROUTER_API_KEY is configured", async () => {
    process.env.OPENROUTER_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        body: new ReadableStream<Uint8Array>({
          start(controller) {
            const encoder = new TextEncoder();
            controller.enqueue(encoder.encode(`data: {"choices":[{"delta":{"content":"Hi"}}]}\n\n`));
            controller.enqueue(encoder.encode(`data: {"choices":[{"finish_reason":"stop"}]}\n\n`));
            controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
            controller.close();
          },
        }),
      })
    );

    const res = await POST(req(validBody));
    expect(res.headers.get("X-AI-Provider")).toBe("openrouter");
    const events = await readNdjson(res);
    expect(events).toEqual([{ type: "text", delta: "Hi" }, { type: "done", finishReason: "stop" }]);
  });

  it("returns 429 once a client exceeds the per-minute rate limit", async () => {
    const headers = { "x-forwarded-for": "203.0.113.42" };
    let lastRes: Response | null = null;
    for (let i = 0; i < 31; i++) {
      lastRes = await POST(req(validBody, headers));
    }
    expect(lastRes!.status).toBe(429);
    expect(lastRes!.headers.get("Retry-After")).toBeTruthy();
  });
});
