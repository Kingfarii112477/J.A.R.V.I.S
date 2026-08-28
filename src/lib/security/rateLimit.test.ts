import { describe, it, expect } from "vitest";
import { createRateLimiter, clientKeyFor, rateLimitResponse } from "./rateLimit";

describe("InMemoryRateLimiter", () => {
  it("allows requests up to the configured limit", () => {
    const limiter = createRateLimiter(3, 60_000);
    expect(limiter.check("a").allowed).toBe(true);
    expect(limiter.check("a").allowed).toBe(true);
    expect(limiter.check("a").allowed).toBe(true);
    expect(limiter.check("a").allowed).toBe(false);
  });

  it("reports decreasing remaining count", () => {
    const limiter = createRateLimiter(3, 60_000);
    expect(limiter.check("a").remaining).toBe(2);
    expect(limiter.check("a").remaining).toBe(1);
    expect(limiter.check("a").remaining).toBe(0);
  });

  it("tracks independent buckets per key", () => {
    const limiter = createRateLimiter(1, 60_000);
    expect(limiter.check("a").allowed).toBe(true);
    expect(limiter.check("b").allowed).toBe(true);
    expect(limiter.check("a").allowed).toBe(false);
    expect(limiter.check("b").allowed).toBe(false);
  });

  it("resets once the window elapses", async () => {
    const limiter = createRateLimiter(1, 30);
    expect(limiter.check("a").allowed).toBe(true);
    expect(limiter.check("a").allowed).toBe(false);
    await new Promise((r) => setTimeout(r, 40));
    expect(limiter.check("a").allowed).toBe(true);
  });
});

describe("clientKeyFor", () => {
  it("prefers the first entry of x-forwarded-for", () => {
    const req = new Request("http://x", { headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" } });
    expect(clientKeyFor(req)).toBe("1.2.3.4");
  });

  it("falls back to x-real-ip", () => {
    const req = new Request("http://x", { headers: { "x-real-ip": "9.9.9.9" } });
    expect(clientKeyFor(req)).toBe("9.9.9.9");
  });

  it("falls back to unknown when no proxy headers are present", () => {
    const req = new Request("http://x");
    expect(clientKeyFor(req)).toBe("unknown");
  });
});

describe("rateLimitResponse", () => {
  it("returns null when the request is within the limit", () => {
    const limiter = createRateLimiter(2, 60_000);
    const req = new Request("http://x", { headers: { "x-forwarded-for": "1.1.1.1" } });
    expect(rateLimitResponse(limiter, req)).toBeNull();
  });

  it("returns a 429 with a Retry-After header once the limit is exceeded", async () => {
    const limiter = createRateLimiter(1, 60_000);
    const req = new Request("http://x", { headers: { "x-forwarded-for": "2.2.2.2" } });
    expect(rateLimitResponse(limiter, req)).toBeNull();
    const res = rateLimitResponse(limiter, req);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(429);
    expect(res!.headers.get("Retry-After")).toBeTruthy();
    const body = await res!.json();
    expect(body.error).toContain("Rate limit");
  });
});
