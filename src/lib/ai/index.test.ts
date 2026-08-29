import { describe, it, expect, afterEach, vi } from "vitest";
import { resolveProviderConfig } from "./index";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("resolveProviderConfig", () => {
  it("selects OpenRouter when a real-shaped key (sk-or-...) is configured", () => {
    vi.stubEnv("OPENROUTER_API_KEY", "sk-or-v1-abc123");
    vi.stubEnv("GROQ_API_KEY", "");
    const config = resolveProviderConfig("CONVERSATION");
    expect(config?.providerId).toBe("openrouter");
  });

  it("falls through to Groq when OPENROUTER_API_KEY is set but not shaped like a real OpenRouter key", () => {
    // Regression test: a real production incident where some hosting
    // platform injected an OPENROUTER_API_KEY-named env var holding a
    // ~366-char JWT (not a real OpenRouter key), silently shadowing the
    // Groq key the deployment was actually configured with — every chat
    // turn failed with a 401 from OpenRouter, with no OPENROUTER_API_KEY
    // ever visibly configured by the user.
    vi.stubEnv("OPENROUTER_API_KEY", "eyJhbGciOiJIUzI1NiJ9.not-a-real-openrouter-key.signature");
    vi.stubEnv("GROQ_API_KEY", "gsk_realkey");
    const config = resolveProviderConfig("CONVERSATION");
    expect(config?.providerId).toBe("groq");
  });

  it("falls through to demo (null) when OPENROUTER_API_KEY is bogus and nothing else is configured", () => {
    vi.stubEnv("OPENROUTER_API_KEY", "not-a-real-key");
    vi.stubEnv("GROQ_API_KEY", "");
    vi.stubEnv("OPENAI_COMPATIBLE_API_KEY", "");
    vi.stubEnv("OPENAI_COMPATIBLE_BASE_URL", "");
    expect(resolveProviderConfig("CONVERSATION")).toBeNull();
  });

  it("selects Groq when only GROQ_API_KEY is set", () => {
    vi.stubEnv("OPENROUTER_API_KEY", "");
    vi.stubEnv("GROQ_API_KEY", "gsk_realkey");
    const config = resolveProviderConfig("CONVERSATION");
    expect(config?.providerId).toBe("groq");
    expect(config?.baseUrl).toBe("https://api.groq.com/openai/v1");
  });
});
