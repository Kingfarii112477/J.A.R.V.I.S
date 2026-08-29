import { describe, it, expect } from "vitest";
import { describeProviderFailure } from "./providerError";

describe("describeProviderFailure", () => {
  it("appends an actionable API-key hint for a 401", () => {
    const msg = describeProviderFailure(401, '{"error":{"message":"Missing Authentication header","code":401}}');
    expect(msg).toContain("AI provider request failed (401)");
    expect(msg).toContain("Missing Authentication header");
    expect(msg).toMatch(/API key is missing, wrong, or was revoked/i);
  });

  it("appends the same hint for a 403", () => {
    const msg = describeProviderFailure(403, '{"error":"forbidden"}');
    expect(msg).toMatch(/API key is missing, wrong, or was revoked/i);
  });

  it("does not append the auth hint for other status codes", () => {
    const msg = describeProviderFailure(500, "internal server error");
    expect(msg).toBe("AI provider request failed (500): internal server error");
    expect(msg).not.toMatch(/API key/i);
  });

  it("truncates a long raw body to 200 characters", () => {
    const longBody = "x".repeat(500);
    const msg = describeProviderFailure(500, longBody);
    expect(msg).toBe(`AI provider request failed (500): ${"x".repeat(200)}`);
  });
});
