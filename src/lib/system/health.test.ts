import { describe, it, expect, vi, afterEach } from "vitest";
import { checkAiHealth } from "./health";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("checkAiHealth", () => {
  it("reports connected when the API says so", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ json: () => Promise.resolve({ aiConnection: "connected" }) })
    );
    expect(await checkAiHealth()).toBe("connected");
  });

  it("reports demo for any non-connected response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ json: () => Promise.resolve({ aiConnection: "demo" }) }));
    expect(await checkAiHealth()).toBe("demo");
  });

  it("reports error when the fetch itself fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    expect(await checkAiHealth()).toBe("error");
  });
});
