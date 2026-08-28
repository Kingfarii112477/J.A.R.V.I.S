import { describe, it, expect } from "vitest";
import { retryDelayMs, shouldRetry } from "./retryPolicy";

describe("retryDelayMs", () => {
  it("grows exponentially with retry count", () => {
    expect(retryDelayMs(0, 500)).toBe(500);
    expect(retryDelayMs(1, 500)).toBe(1000);
    expect(retryDelayMs(2, 500)).toBe(2000);
  });

  it("caps at the configured maximum", () => {
    expect(retryDelayMs(10, 500, 8000)).toBe(8000);
  });
});

describe("shouldRetry", () => {
  it("allows retrying while under the budget", () => {
    expect(shouldRetry(0, 2)).toBe(true);
    expect(shouldRetry(1, 2)).toBe(true);
  });

  it("stops once the retry budget is exhausted", () => {
    expect(shouldRetry(2, 2)).toBe(false);
  });
});
