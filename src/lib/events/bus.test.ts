import { describe, it, expect, beforeEach, vi } from "vitest";
import { eventBus } from "./bus";

beforeEach(() => {
  eventBus.reset();
});

describe("eventBus", () => {
  it("delivers emitted payloads to subscribed listeners", () => {
    const handler = vi.fn();
    eventBus.on("diagnostics.completed", handler);
    eventBus.emit("diagnostics.completed", { score: 97 });
    expect(handler).toHaveBeenCalledWith({ score: 97 });
  });

  it("supports multiple listeners for the same event", () => {
    const a = vi.fn();
    const b = vi.fn();
    eventBus.on("tool.started", a);
    eventBus.on("tool.started", b);
    eventBus.emit("tool.started", { toolName: "calculator", callId: "1", params: {} });
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it("unsubscribes via the returned cleanup function", () => {
    const handler = vi.fn();
    const off = eventBus.on("memory.updated", handler);
    off();
    eventBus.emit("memory.updated", { count: 1, action: "store" });
    expect(handler).not.toHaveBeenCalled();
  });

  it("once() fires exactly one time then auto-unsubscribes", () => {
    const handler = vi.fn();
    eventBus.once("security.warning", handler);
    eventBus.emit("security.warning", { message: "first" });
    eventBus.emit("security.warning", { message: "second" });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({ message: "first" });
  });

  it("does not let one throwing listener block the others", () => {
    const good = vi.fn();
    eventBus.on("ai.error", () => {
      throw new Error("boom");
    });
    eventBus.on("ai.error", good);
    expect(() => eventBus.emit("ai.error", { sessionId: "s1", message: "oops" })).not.toThrow();
    expect(good).toHaveBeenCalled();
  });

  it("records recent history for inspection", () => {
    eventBus.emit("jarvis.boot", {});
    eventBus.emit("jarvis.ready", {});
    const history = eventBus.getRecentHistory();
    expect(history.map((h) => h.event)).toEqual(["jarvis.boot", "jarvis.ready"]);
  });

  it("a listener unsubscribing itself mid-emit does not throw or skip siblings", () => {
    const order: string[] = [];
    const offA = eventBus.on("voice.listening", () => {
      order.push("a");
      offA();
    });
    eventBus.on("voice.listening", () => order.push("b"));
    eventBus.emit("voice.listening", {});
    expect(order).toEqual(["a", "b"]);
  });
});
