import { describe, it, expect } from "vitest";
import { classifyIntent } from "./router";

describe("classifyIntent", () => {
  it("classifies system-oriented requests", () => {
    expect(classifyIntent("run a full diagnostic")).toBe("SYSTEM");
    expect(classifyIntent("what's the system status")).toBe("SYSTEM");
  });

  it("classifies navigation requests", () => {
    expect(classifyIntent("open the memory screen")).toBe("NAVIGATION");
    expect(classifyIntent("go to settings")).toBe("NAVIGATION");
  });

  it("classifies memory-oriented requests", () => {
    expect(classifyIntent("do you remember my name")).toBe("MEMORY");
    expect(classifyIntent("what do you know about me")).toBe("MEMORY");
  });

  it("classifies automation requests", () => {
    expect(classifyIntent("trigger my morning routine workflow")).toBe("AUTOMATION");
  });

  it("classifies research requests", () => {
    expect(classifyIntent("search for the latest AI news")).toBe("RESEARCH");
  });

  it("classifies coding requests", () => {
    expect(classifyIntent("help me debug this typescript function")).toBe("CODING");
  });

  it("classifies reasoning requests", () => {
    expect(classifyIntent("why does this approach work better")).toBe("REASONING");
  });

  it("classifies voice-control requests", () => {
    expect(classifyIntent("stop talking")).toBe("VOICE");
  });

  it("falls back to CONVERSATION for ordinary chat", () => {
    expect(classifyIntent("good morning")).toBe("CONVERSATION");
    expect(classifyIntent("how's it going")).toBe("CONVERSATION");
  });
});
