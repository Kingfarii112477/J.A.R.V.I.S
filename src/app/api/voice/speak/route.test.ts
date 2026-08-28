import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { GET, POST } from "./route";

function req(body: unknown, headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/voice/speak", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  for (const key of ["AZURE_SPEECH_KEY", "AZURE_SPEECH_REGION", "OPENAI_API_KEY", "ELEVENLABS_API_KEY"]) {
    delete process.env[key];
  }
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("GET /api/voice/speak", () => {
  it("reports every provider as unavailable when no keys are configured, without ever including the key values", async () => {
    const res = await GET();
    const body = await res.json();
    expect(body).toEqual({
      openai: { available: false },
      elevenlabs: { available: false },
      azure: { available: false },
    });
  });

  it("reports azure as available once both AZURE_SPEECH_KEY and AZURE_SPEECH_REGION are set, without echoing the key", async () => {
    process.env.AZURE_SPEECH_KEY = "super-secret-azure-key";
    process.env.AZURE_SPEECH_REGION = "centralindia";
    const res = await GET();
    const bodyText = await res.text();
    expect(JSON.parse(bodyText).azure).toEqual({ available: true });
    expect(bodyText).not.toContain("super-secret-azure-key");
  });
});

describe("POST /api/voice/speak", () => {
  it("rejects an invalid JSON body", async () => {
    const res = await POST(new Request("http://localhost/api/voice/speak", { method: "POST", body: "not json" }));
    expect(res.status).toBe(400);
  });

  it("rejects a request missing required fields", async () => {
    const res = await POST(req({ text: "hello" }));
    expect(res.status).toBe(400);
  });

  it("rejects an unsupported provider value", async () => {
    const res = await POST(req({ text: "hello", provider: "browser" }));
    expect(res.status).toBe(400);
  });

  it("returns 501 unavailable for azure when unconfigured, with a human-readable message and no secrets", async () => {
    const res = await POST(req({ text: "Hello there.", provider: "azure" }));
    expect(res.status).toBe(501);
    const body = await res.json();
    expect(body.unavailable).toBe(true);
    expect(body.message).toMatch(/not configured/i);
  });

  it("returns 501 unavailable for openai when unconfigured", async () => {
    const res = await POST(req({ text: "Hello there.", provider: "openai" }));
    expect(res.status).toBe(501);
    expect((await res.json()).unavailable).toBe(true);
  });

  it("returns 501 unavailable for elevenlabs when unconfigured", async () => {
    const res = await POST(req({ text: "Hello there.", provider: "elevenlabs" }));
    expect(res.status).toBe(501);
    expect((await res.json()).unavailable).toBe(true);
  });

  it("synthesizes real audio bytes via Azure when configured, using the subscription key only in the outbound request header — never in the response", async () => {
    process.env.AZURE_SPEECH_KEY = "super-secret-azure-key";
    process.env.AZURE_SPEECH_REGION = "centralindia";
    const fakeAudio = new Uint8Array([1, 2, 3, 4]).buffer;
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, arrayBuffer: async () => fakeAudio });
    vi.stubGlobal("fetch", fetchMock);

    const res = await POST(req({ text: "Diagnostics complete.", provider: "azure" }));

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("audio/mpeg");
    const [, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((requestInit.headers as Record<string, string>)["Ocp-Apim-Subscription-Key"]).toBe("super-secret-azure-key");
    const buf = await res.arrayBuffer();
    expect(new Uint8Array(buf)).toEqual(new Uint8Array(fakeAudio));
  });

  it("returns 502 with a truncated, non-secret detail when Azure's API call fails", async () => {
    process.env.AZURE_SPEECH_KEY = "super-secret-azure-key";
    process.env.AZURE_SPEECH_REGION = "centralindia";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 401, text: async () => "Access denied due to invalid subscription key." })
    );

    const res = await POST(req({ text: "Diagnostics complete.", provider: "azure" }));

    expect(res.status).toBe(502);
    const bodyText = await res.text();
    expect(bodyText).not.toContain("super-secret-azure-key");
    expect(JSON.parse(bodyText).error).toMatch(/azure speech request failed/i);
  });

  it("returns 429 once a client exceeds the per-minute rate limit", async () => {
    const headers = { "x-forwarded-for": "198.51.100.7" };
    let lastRes: Response | null = null;
    for (let i = 0; i < 31; i++) {
      lastRes = await POST(req({ text: "hi", provider: "azure" }, headers));
    }
    expect(lastRes!.status).toBe(429);
    expect(lastRes!.headers.get("Retry-After")).toBeTruthy();
  });
});
