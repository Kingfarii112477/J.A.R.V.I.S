import { describe, it, expect, vi, afterEach } from "vitest";

const appMock = { addListener: vi.fn() };

vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: vi.fn() },
}));
vi.mock("@capacitor/app", () => ({ App: appMock }));

import { Capacitor } from "@capacitor/core";

afterEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  vi.unstubAllGlobals();
});

describe("subscribeAppLifecycle", () => {
  it("registers native resume/pause listeners and forwards them", async () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    const resumeCbs: (() => void)[] = [];
    const pauseCbs: (() => void)[] = [];
    const removeResume = vi.fn();
    const removePause = vi.fn();
    appMock.addListener.mockImplementation((event: string, cb: () => void) => {
      if (event === "resume") {
        resumeCbs.push(cb);
        return Promise.resolve({ remove: removeResume });
      }
      pauseCbs.push(cb);
      return Promise.resolve({ remove: removePause });
    });

    const { subscribeAppLifecycle } = await import("./lifecycle");
    const onForeground = vi.fn();
    const onBackground = vi.fn();
    const unsubscribe = subscribeAppLifecycle({ onForeground, onBackground });
    await Promise.resolve();
    await Promise.resolve();

    resumeCbs[0]();
    expect(onForeground).toHaveBeenCalledTimes(1);
    pauseCbs[0]();
    expect(onBackground).toHaveBeenCalledTimes(1);

    unsubscribe();
    expect(removeResume).toHaveBeenCalled();
    expect(removePause).toHaveBeenCalled();
  });

  it("falls back to document.visibilitychange on the web", async () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);
    const handlers: (() => void)[] = [];
    const removeEventListener = vi.fn();
    const doc = {
      hidden: false,
      addEventListener: vi.fn((_event: string, cb: () => void) => {
        handlers.push(cb);
      }),
      removeEventListener,
    };
    vi.stubGlobal("document", doc);

    const { subscribeAppLifecycle } = await import("./lifecycle");
    const onForeground = vi.fn();
    const onBackground = vi.fn();
    const unsubscribe = subscribeAppLifecycle({ onForeground, onBackground });

    doc.hidden = true;
    handlers[0]();
    expect(onBackground).toHaveBeenCalledTimes(1);

    doc.hidden = false;
    handlers[0]();
    expect(onForeground).toHaveBeenCalledTimes(1);

    unsubscribe();
    expect(removeEventListener).toHaveBeenCalledWith("visibilitychange", handlers[0]);
  });
});
