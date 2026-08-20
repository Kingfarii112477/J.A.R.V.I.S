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

describe("jarvisStore toasts", () => {
  it("pushToast adds and dismissToast removes by id", () => {
    useJarvisStore.getState().pushToast("Optimization complete.", "success");
    const toast = useJarvisStore.getState().toasts.at(-1)!;
    expect(toast.message).toBe("Optimization complete.");

    useJarvisStore.getState().dismissToast(toast.id);
    expect(useJarvisStore.getState().toasts.find((t) => t.id === toast.id)).toBeUndefined();
  });
});
