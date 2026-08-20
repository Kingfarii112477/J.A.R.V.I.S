import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Regression test for a real bug: zustand's default persist merge is a
 * shallow Object.assign, so a persisted `settings` object missing fields
 * (from an older schema version, or corrupted/partial storage) used to
 * silently blank out every other setting — e.g. voiceEnabled became
 * `undefined` and the Voice screen rendered "DISABLED". The store now
 * supplies a custom `merge` that deep-merges `settings` onto the current
 * defaults, so partial persisted state is backfilled instead of replacing
 * the whole object.
 */
describe("jarvisStore persistence merge", () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
  });

  it("backfills missing settings fields from defaults when persisted state is partial", async () => {
    localStorage.setItem(
      "jarvis-os-store",
      JSON.stringify({
        state: { settings: { skipBootAnimation: true } },
        version: 0,
      })
    );

    const { useJarvisStore, defaultSettings } = await import("./jarvisStore");
    const settings = useJarvisStore.getState().settings;

    expect(settings.skipBootAnimation).toBe(true);
    expect(settings.voiceEnabled).toBe(defaultSettings.voiceEnabled);
    expect(settings.aiName).toBe(defaultSettings.aiName);
    expect(settings.graphicsQuality).toBe(defaultSettings.graphicsQuality);
  });

  it("falls back to full defaults when nothing is persisted", async () => {
    const { useJarvisStore, defaultSettings } = await import("./jarvisStore");
    expect(useJarvisStore.getState().settings).toEqual(defaultSettings);
  });
});
