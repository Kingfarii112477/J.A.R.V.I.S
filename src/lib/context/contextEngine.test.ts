import { describe, it, expect } from "vitest";
import { assembleContext } from "./contextEngine";

const base = {
  systemPrompt: "You are J.A.R.V.I.S.",
  screen: "chat",
  jarvisState: "IDLE",
  aiName: "J.A.R.V.I.S.",
  verbosity: "balanced" as const,
  retrievedMemories: [],
  history: [],
};

describe("assembleContext", () => {
  it("always starts with a single system message", () => {
    const messages = assembleContext(base);
    expect(messages[0].role).toBe("system");
    expect(messages[0].content).toContain("You are J.A.R.V.I.S.");
  });

  it("includes the current screen and jarvis state in the system message", () => {
    const messages = assembleContext({ ...base, screen: "diagnostics", jarvisState: "DIAGNOSTICS" });
    expect(messages[0].content).toContain("diagnostics");
    expect(messages[0].content).toContain("DIAGNOSTICS");
  });

  it("includes retrieved memories when present", () => {
    const messages = assembleContext({
      ...base,
      retrievedMemories: [{ content: "Preferred language: English.", type: "PREFERENCE" }],
    });
    expect(messages[0].content).toContain("Preferred language: English.");
  });

  it("omits the memory section entirely when there are none", () => {
    const messages = assembleContext(base);
    expect(messages[0].content).not.toContain("remember about this user");
  });

  it("includes the active task title when set", () => {
    const messages = assembleContext({ ...base, activeTaskTitle: "Finish the quarterly report" });
    expect(messages[0].content).toContain("Finish the quarterly report");
  });

  it("includes a tool result summary when provided", () => {
    const messages = assembleContext({
      ...base,
      toolResult: { toolName: "weather", summary: "28°C in the configured city" },
    });
    expect(messages[0].content).toContain("weather");
    expect(messages[0].content).toContain("28°C");
  });

  it("preserves full history when it fits comfortably under budget", () => {
    const history = [
      { role: "user" as const, content: "hello" },
      { role: "assistant" as const, content: "hi there" },
    ];
    const messages = assembleContext({ ...base, history });
    expect(messages.slice(1)).toEqual(history);
  });

  it("trims oldest history first when the transcript is far over budget", () => {
    const giantMessage = { role: "user" as const, content: "x".repeat(20000) };
    const recentMessage = { role: "assistant" as const, content: "recent and short" };
    const messages = assembleContext({ ...base, history: [giantMessage, recentMessage] });

    // The oversized old message should be dropped; the short recent one kept.
    expect(messages.some((m) => m.content === recentMessage.content)).toBe(true);
    expect(messages.some((m) => m.content === giantMessage.content)).toBe(false);
  });

  it("keeps the most recent turns when trimming, not the oldest", () => {
    const history = Array.from({ length: 50 }, (_, i) => ({
      role: i % 2 === 0 ? ("user" as const) : ("assistant" as const),
      content: `turn ${i} `.repeat(200), // long enough that not all 50 fit
    }));
    const messages = assembleContext({ ...base, history });
    const keptContents = messages.slice(1).map((m) => m.content);
    // The very last turn (49) should always survive trimming.
    expect(keptContents.some((c) => c.startsWith("turn 49 "))).toBe(true);
  });
});
