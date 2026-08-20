import { describe, it, expect } from "vitest";
import { routeToTool } from "./router";

describe("routeToTool", () => {
  it("routes arithmetic questions to the calculator tool", () => {
    const match = routeToTool("what's 12 * 4");
    expect(match?.toolName).toBe("calculator");
    expect(match?.args.expression).toBe("12 * 4");
  });

  it("routes a bare arithmetic expression to the calculator tool", () => {
    const match = routeToTool("2 + 2 * 5");
    expect(match?.toolName).toBe("calculator");
  });

  it("routes time questions to the time tool", () => {
    expect(routeToTool("what time is it")?.toolName).toBe("time");
    expect(routeToTool("What's the time?")?.toolName).toBe("time");
  });

  it("routes weather questions to the weather tool with the city extracted", () => {
    const match = routeToTool("what's the weather in Paris");
    expect(match?.toolName).toBe("weather");
    expect(match?.args.city).toBe("Paris");
  });

  it("routes search phrasing to the web_search tool", () => {
    expect(routeToTool("search for the latest react release")?.toolName).toBe("web_search");
    expect(routeToTool("look up quantum computing")?.toolName).toBe("web_search");
  });

  it("routes recall phrasing to the memory_search tool", () => {
    const match = routeToTool("what do you remember about my preferences");
    expect(match?.toolName).toBe("memory_search");
    expect(match?.args.query).toBe("my preferences");
  });

  it("returns null for ordinary conversation that matches no tool pattern", () => {
    expect(routeToTool("tell me a story about robots")).toBeNull();
    expect(routeToTool("how are you today")).toBeNull();
  });

  it("does not misfire the calculator on prose containing a hyphen", () => {
    expect(routeToTool("state-of-the-art system")).toBeNull();
  });
});
