import { describe, it, expect, vi, beforeEach } from "vitest";
import { transcribeStandalone } from "./standaloneVoice";

vi.mock("./standalone", () => ({
  getCredential: vi.fn(async (k: string) => (k === "ASSEMBLYAI_API_KEY" ? "test-key" : null)),
}));

/**
 * Guards the bug that made every recording unusable in the Android app.
 *
 * CapacitorHttp patches fetch and routes the body through convertBody(),
 * which handles ReadableStream, Uint8Array, URLSearchParams, FormData and
 * File — but has NO Blob branch, so a Blob falls through to its final
 * `return { data: body, type: "json" }`. The recording was JSON-
 * serialised (a Blob stringifies to "{}") and posted as application/json,
 * which AssemblyAI reported as "Transcoding failed. File type
 * application/json (JSON text data)". The audio never left the device.
 */
describe("transcribeStandalone upload body", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("uploads a File, not a bare Blob, so the bytes survive CapacitorHttp", async () => {
    const seen: BodyInit[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        if (init?.body) seen.push(init.body);
        return {
          ok: true,
          status: 200,
          json: async () => ({ upload_url: "https://x/y", id: "t1", status: "completed", text: "hi" }),
        } as unknown as Response;
      })
    );

    const audio = new Blob([new Uint8Array([1, 2, 3, 4])], { type: "audio/webm" });
    await transcribeStandalone(audio);

    const uploaded = seen[0];
    expect(uploaded).toBeInstanceOf(File);
    // A Blob that is not a File takes convertBody's JSON fallback.
    expect((uploaded as File).type).toBe("audio/webm");
    expect((uploaded as File).size).toBe(4);
  });

  it("keeps an audio content type when the recorder didn't set one", async () => {
    const seen: BodyInit[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        if (init?.body) seen.push(init.body);
        return {
          ok: true,
          status: 200,
          json: async () => ({ upload_url: "https://x/y", id: "t1", status: "completed", text: "hi" }),
        } as unknown as Response;
      })
    );

    await transcribeStandalone(new Blob([new Uint8Array([9])]));
    // An empty Content-Type makes the native layer skip the body
    // entirely (CapacitorHttpUrlConnection returns early), so a fallback
    // type is not cosmetic.
    expect((seen[0] as File).type).toBe("audio/webm");
  });
});
