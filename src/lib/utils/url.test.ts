import { describe, it, expect } from "vitest";
import { isSafeExternalUrl } from "./url";

describe("isSafeExternalUrl", () => {
  it("accepts http and https URLs", () => {
    expect(isSafeExternalUrl("https://example.com/article")).toBe(true);
    expect(isSafeExternalUrl("http://example.com")).toBe(true);
  });

  it("rejects javascript: URLs", () => {
    expect(isSafeExternalUrl("javascript:alert(1)")).toBe(false);
  });

  it("rejects data: URLs", () => {
    expect(isSafeExternalUrl("data:text/html,<script>alert(1)</script>")).toBe(false);
  });

  it("rejects malformed input instead of throwing", () => {
    expect(isSafeExternalUrl("not a url")).toBe(false);
  });
});
