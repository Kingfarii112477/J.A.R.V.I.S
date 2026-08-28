import { describe, it, expect, beforeEach } from "vitest";
import { useJarvisStore, defaultSettings, mergeJarvisStore } from "./jarvisStore";

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

  it("updateSettings persists Phase 5 voice/language fields without dropping unrelated ones", () => {
    useJarvisStore.getState().updateSettings({
      voiceVolume: 40,
      autoLanguageDetection: false,
      preferredLanguage: "ur",
      silenceTimeoutMs: 2500,
      wakeWordMode: "push-to-talk",
    });
    const settings = useJarvisStore.getState().settings;
    expect(settings.voiceVolume).toBe(40);
    expect(settings.autoLanguageDetection).toBe(false);
    expect(settings.preferredLanguage).toBe("ur");
    expect(settings.silenceTimeoutMs).toBe(2500);
    expect(settings.wakeWordMode).toBe("push-to-talk");
    expect(settings.ttsProvider).toBe(defaultSettings.ttsProvider);
  });
});

describe("mergeJarvisStore", () => {
  it("fills in Phase 5 settings fields missing from an older persisted schema instead of leaving them undefined", () => {
    const current = useJarvisStore.getState();
    // Simulates localStorage written before Phase 5 — no voice/language
    // fields exist on the persisted settings object at all.
    const staleSettings = { ...defaultSettings } as Partial<typeof defaultSettings>;
    delete staleSettings.voiceVolume;
    delete staleSettings.autoLanguageDetection;
    delete staleSettings.silenceTimeoutMs;
    delete staleSettings.wakeWordMode;
    const persisted = { settings: { ...staleSettings, aiName: "Old Name" } };

    const merged = mergeJarvisStore(persisted, current);

    expect(merged.settings.aiName).toBe("Old Name");
    expect(merged.settings.voiceVolume).toBe(defaultSettings.voiceVolume);
    expect(merged.settings.autoLanguageDetection).toBe(defaultSettings.autoLanguageDetection);
    expect(merged.settings.silenceTimeoutMs).toBe(defaultSettings.silenceTimeoutMs);
    expect(merged.settings.wakeWordMode).toBe(defaultSettings.wakeWordMode);
  });

  it("a persisted value overrides the default when present", () => {
    const current = useJarvisStore.getState();
    const merged = mergeJarvisStore({ settings: { voiceVolume: 25 } }, current);
    expect(merged.settings.voiceVolume).toBe(25);
  });

  it("treats a missing/undefined persisted state as an empty patch rather than throwing", () => {
    const current = useJarvisStore.getState();
    expect(() => mergeJarvisStore(undefined, current)).not.toThrow();
    expect(mergeJarvisStore(undefined, current).settings).toEqual(current.settings);
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

describe("jarvisStore tasks", () => {
  beforeEach(() => {
    useJarvisStore.setState({ tasks: [] });
  });

  it("addTask creates a PENDING task with timestamps", () => {
    const task = useJarvisStore.getState().addTask({ title: "Draft report" });
    expect(task.status).toBe("PENDING");
    expect(task.priority).toBe("medium");
    expect(useJarvisStore.getState().tasks).toHaveLength(1);
  });

  it("updateTaskStatus transitions status and bumps updatedAt", async () => {
    const task = useJarvisStore.getState().addTask({ title: "Draft report" });
    await new Promise((r) => setTimeout(r, 5));
    const updated = useJarvisStore.getState().updateTaskStatus(task.id, "COMPLETED");
    expect(updated?.status).toBe("COMPLETED");
    expect(updated!.updatedAt).toBeGreaterThan(task.updatedAt);
  });

  it("updateTaskStatus returns null for an unknown id", () => {
    expect(useJarvisStore.getState().updateTaskStatus("nope", "COMPLETED")).toBeNull();
  });

  it("removeTask deletes the task", () => {
    const task = useJarvisStore.getState().addTask({ title: "Temp" });
    useJarvisStore.getState().removeTask(task.id);
    expect(useJarvisStore.getState().tasks).toHaveLength(0);
  });
});

describe("jarvisStore failed unlock attempts", () => {
  it("increments and resets independently of other state", () => {
    useJarvisStore.setState({ failedUnlockAttempts: 0 });
    useJarvisStore.getState().incrementFailedUnlockAttempts();
    useJarvisStore.getState().incrementFailedUnlockAttempts();
    expect(useJarvisStore.getState().failedUnlockAttempts).toBe(2);
    useJarvisStore.getState().resetFailedUnlockAttempts();
    expect(useJarvisStore.getState().failedUnlockAttempts).toBe(0);
  });
});

describe("jarvisStore active tool calls", () => {
  it("tracks concurrent tool calls for the 3D core's particle activity", () => {
    useJarvisStore.setState({ activeToolCalls: 0 });
    useJarvisStore.getState().incrementActiveToolCalls();
    useJarvisStore.getState().incrementActiveToolCalls();
    expect(useJarvisStore.getState().activeToolCalls).toBe(2);
    useJarvisStore.getState().decrementActiveToolCalls();
    expect(useJarvisStore.getState().activeToolCalls).toBe(1);
  });

  it("never goes negative", () => {
    useJarvisStore.setState({ activeToolCalls: 0 });
    useJarvisStore.getState().decrementActiveToolCalls();
    expect(useJarvisStore.getState().activeToolCalls).toBe(0);
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
