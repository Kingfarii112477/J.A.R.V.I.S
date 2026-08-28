// @vitest-environment node
//
// This suite exercises multipart FormData/Blob request bodies, which the
// project's default jsdom test environment (see vitest.config.mts) does
// not parse the same way the real Next.js "nodejs" runtime does (see
// `export const runtime = "nodejs"` in route.ts) — request.formData()
// under jsdom silently returns no fields. Overriding to Node's own fetch
// implementation for just this file matches the route's actual runtime
// and is what makes these assertions meaningful.
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { GET, POST } from "./route";

function formReq(fields: Record<string, string | Blob>, headers: Record<string, string> = {}) {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.append(key, value);
  return new Request("http://localhost/api/voice/transcribe", { method: "POST", headers, body: form });
}

const SMALL_AUDIO = new Blob([new Uint8Array([1, 2, 3])], { type: "audio/webm" });

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  for (const key of ["OPENAI_API_KEY", "ASSEMBLYAI_API_KEY"]) delete process.env[key];
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("GET /api/voice/transcribe", () => {
  it("reports every provider as unavailable when no keys are configured", async () => {
    const res = await GET();
    expect(await res.json()).toEqual({ whisper: { available: false }, assemblyai: { available: false } });
  });

  it("reports whisper as available once OPENAI_API_KEY is set, without echoing the key", async () => {
    process.env.OPENAI_API_KEY = "sk-super-secret-openai-key";
    const res = await GET();
    const bodyText = await res.text();
    expect(JSON.parse(bodyText).whisper).toEqual({ available: true });
    expect(bodyText).not.toContain("sk-super-secret-openai-key");
  });
});

describe("POST /api/voice/transcribe", () => {
  it("rejects a request that isn't valid form data", async () => {
    const res = await POST(new Request("http://localhost/api/voice/transcribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }));
    expect(res.status).toBe(400);
  });

  it("rejects a missing/invalid provider", async () => {
    const res = await POST(formReq({ audio: SMALL_AUDIO }));
    expect(res.status).toBe(400);
  });

  it("rejects a request missing audio", async () => {
    const res = await POST(formReq({ provider: "whisper" }));
    expect(res.status).toBe(400);
  });

  it("rejects audio larger than 20MB", async () => {
    const bigAudio = new Blob([new Uint8Array(21 * 1024 * 1024)], { type: "audio/webm" });
    const res = await POST(formReq({ provider: "whisper", audio: bigAudio }));
    expect(res.status).toBe(413);
  });

  it("returns 501 unavailable for whisper when unconfigured", async () => {
    const res = await POST(formReq({ provider: "whisper", audio: SMALL_AUDIO }));
    expect(res.status).toBe(501);
    expect((await res.json()).unavailable).toBe(true);
  });

  it("returns 501 unavailable for assemblyai when unconfigured", async () => {
    const res = await POST(formReq({ provider: "assemblyai", audio: SMALL_AUDIO }));
    expect(res.status).toBe(501);
    expect((await res.json()).unavailable).toBe(true);
  });

  it("transcribes via Whisper when configured, using the API key only in the outbound request header", async () => {
    process.env.OPENAI_API_KEY = "sk-super-secret-openai-key";
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ text: "System status nominal." }) });
    vi.stubGlobal("fetch", fetchMock);

    const res = await POST(formReq({ provider: "whisper", audio: SMALL_AUDIO }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ transcript: "System status nominal." });
    const [, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((requestInit.headers as Record<string, string>).Authorization).toBe("Bearer sk-super-secret-openai-key");
  });

  it("returns 502 with a truncated, non-secret detail when Whisper's API call fails", async () => {
    process.env.OPENAI_API_KEY = "sk-super-secret-openai-key";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 401, text: async () => "Invalid API key." }));

    const res = await POST(formReq({ provider: "whisper", audio: SMALL_AUDIO }));

    expect(res.status).toBe(502);
    const bodyText = await res.text();
    expect(bodyText).not.toContain("sk-super-secret-openai-key");
  });

  it("transcribes via AssemblyAI end to end (upload -> create -> poll), surfacing detected language without ever leaking the key", async () => {
    process.env.ASSEMBLYAI_API_KEY = "aai-super-secret-key";
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      void init;
      if (url.endsWith("/v2/upload")) {
        return { ok: true, status: 200, json: async () => ({ upload_url: "https://cdn.assemblyai.com/upload/abc" }) };
      }
      if (url.endsWith("/v2/transcript")) {
        return { ok: true, status: 200, json: async () => ({ id: "transcript-1" }) };
      }
      if (url.includes("/v2/transcript/transcript-1")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            status: "completed",
            text: "System ka status batao.",
            confidence: 0.97,
            language_code: "ur",
            language_confidence: 0.81,
          }),
        };
      }
      throw new Error(`Unexpected URL: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const res = await POST(formReq({ provider: "assemblyai", audio: SMALL_AUDIO }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      transcript: "System ka status batao.",
      confidence: 0.97,
      detectedLanguageCode: "ur",
      detectedLanguageConfidence: 0.81,
    });
    for (const call of fetchMock.mock.calls) {
      const [, init] = call as [string, RequestInit | undefined];
      const auth = (init?.headers as Record<string, string> | undefined)?.Authorization;
      if (auth) expect(auth).toBe("aai-super-secret-key");
    }
    const bodyText = JSON.stringify(body);
    expect(bodyText).not.toContain("aai-super-secret-key");
  }, 10_000);

  it("returns 429 once a client exceeds the per-minute rate limit", async () => {
    const headers = { "x-forwarded-for": "198.51.100.9" };
    let lastRes: Response | null = null;
    for (let i = 0; i < 31; i++) {
      lastRes = await POST(formReq({ provider: "whisper", audio: SMALL_AUDIO }, headers));
    }
    expect(lastRes!.status).toBe(429);
    expect(lastRes!.headers.get("Retry-After")).toBeTruthy();
  });
});
