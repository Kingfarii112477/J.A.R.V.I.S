import { describe, it, expect, beforeEach } from "vitest";
import { useJarvisStore, defaultSettings } from "./jarvisStore";

beforeEach(() => {
  useJarvisStore.setState({ settings: defaultSettings, state: "IDLE", previousState: "IDLE" });
});

describe("jarvisStore state machine", () => {
  it("transitions state and remembers the previous one", () => {
    useJarvisStore.getState().setState("THINKING");
    expect(useJarvisStore.getState().state).toBe("THINKING");
    expect(useJarvisStore.getState().previousState).toBe("IDLE");

    useJarvisStore.getState().setState("SPEAKING");
    expect(useJarvisStore.getState().state).toBe("SPEAKING");
    expect(useJarvisStore.getState().previousState).toBe("THINKING");
  });
});

describe("jarvisStore settings", () => {
  it("updateSettings merges a partial patch without dropping other fields", () => {
    useJarvisStore.getState().updateSettings({ aiName: "FRIDAY" });
    const settings = useJarvisStore.getState().settings;
    expect(settings.aiName).toBe("FRIDAY");
    expect(settings.voiceEnabled).toBe(defaultSettings.voiceEnabled);
    expect(settings.graphicsQuality).toBe(defaultSettings.graphicsQuality);
  });

  it("resetSettings restores every field to defaults", () => {
    useJarvisStore.getState().updateSettings({ aiName: "FRIDAY", soundVolume: 5, reducedMotion: true });
    useJarvisStore.getState().resetSettings();
    expect(useJarvisStore.getState().settings).toEqual(defaultSettings);
  });
});

describe("jarvisStore terminal", () => {
  it("caps terminal history at 500 lines", () => {
    useJarvisStore.getState().clearTerminal();
    for (let i = 0; i < 520; i++) {
      useJarvisStore.getState().pushTerminalLine({ kind: "output", text: `line ${i}` });
    }
    expect(useJarvisStore.getState().terminalLines).toHaveLength(500);
    expect(useJarvisStore.getState().terminalLines[499].text).toBe("line 519");
  });
});

describe("jarvisStore toasts", () => {
  it("pushToast adds and dismissToast removes by id", () => {
    useJarvisStore.getState().pushToast("Optimization complete.", "success");
    const toast = useJarvisStore.getState().toasts.at(-1)!;
    expect(toast.message).toBe("Optimization complete.");

    useJarvisStore.getState().dismissToast(toast.id);
    expect(useJarvisStore.getState().toasts.find((t) => t.id === toast.id)).toBeUndefined();
  });
});
