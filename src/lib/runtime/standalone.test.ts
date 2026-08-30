import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * These tests exist because of a real, user-reported bug: keys entered in
 * Settings appeared to save, and were gone on the next visit. The native
 * cause (a fire-and-forget SharedPreferences write) is fixed in
 * SecureCredentialsPlugin.kt, but what made it *invisible* lived here —
 * every failure was swallowed and rendered as "Not set", which looks
 * exactly like a store that is simply empty. The assertions below pin
 * down that a broken store now reports itself as broken.
 */

const getAll = vi.fn();
const getStatus = vi.fn();
const set = vi.fn();
const clearAll = vi.fn();
const diagnose = vi.fn();

vi.mock("@capacitor/core", () => ({
  registerPlugin: () => ({ getAll, getStatus, set, clearAll, diagnose }),
}));

function runningOnDevice(native: boolean) {
  (window as unknown as { Capacitor?: unknown }).Capacitor = native
    ? { isNativePlatform: () => true }
    : undefined;
}

async function freshModule() {
  vi.resetModules();
  return import("./standalone");
}

beforeEach(() => {
  vi.clearAllMocks();
  runningOnDevice(true);
});

afterEach(() => {
  runningOnDevice(false);
});

describe("loadCredentials", () => {
  it("caches a successful read so provider calls don't re-cross the bridge", async () => {
    const mod = await freshModule();
    getAll.mockResolvedValue({ GROQ_API_KEY: "abc" });

    expect(await mod.loadCredentials()).toEqual({ GROQ_API_KEY: "abc" });
    expect(await mod.loadCredentials()).toEqual({ GROQ_API_KEY: "abc" });
    expect(getAll).toHaveBeenCalledTimes(1);
  });

  it("does not cache a failure, so a transient fault doesn't permanently look like 'no keys'", async () => {
    const mod = await freshModule();
    // The bridge isn't ready yet during early startup...
    getAll.mockRejectedValueOnce(new Error("bridge not ready"));
    expect(await mod.loadCredentials()).toEqual({});

    // ...and once it is, the real keys must come through rather than the
    // empty result being served from cache for the rest of the session.
    getAll.mockResolvedValue({ GROQ_API_KEY: "abc" });
    expect(await mod.loadCredentials()).toEqual({ GROQ_API_KEY: "abc" });
  });

  it("caches a genuinely empty store (an empty object is a valid answer)", async () => {
    const mod = await freshModule();
    getAll.mockResolvedValue({});

    await mod.loadCredentials();
    await mod.loadCredentials();
    expect(getAll).toHaveBeenCalledTimes(1);
  });

  it("re-reads after a key is written", async () => {
    const mod = await freshModule();
    getAll.mockResolvedValue({});
    await mod.loadCredentials();

    set.mockResolvedValue({ saved: true, cleared: false });
    await mod.setCredential("GROQ_API_KEY", "abc");

    getAll.mockResolvedValue({ GROQ_API_KEY: "abc" });
    expect(await mod.loadCredentials()).toEqual({ GROQ_API_KEY: "abc" });
  });
});

describe("getCredentialStatus", () => {
  it("reports which keys are set", async () => {
    const mod = await freshModule();
    getStatus.mockResolvedValue({ GROQ_API_KEY: true, OPENAI_API_KEY: false });
    expect(await mod.getCredentialStatus()).toEqual({ GROQ_API_KEY: true, OPENAI_API_KEY: false });
  });

  it("propagates a store failure instead of reporting 'nothing configured'", async () => {
    const mod = await freshModule();
    getStatus.mockRejectedValue(new Error("keystore unavailable"));
    // The whole point: this must NOT resolve to {}.
    await expect(mod.getCredentialStatus()).rejects.toThrow("keystore unavailable");
  });
});

describe("setCredential", () => {
  it("rejects when the native side could not persist the value", async () => {
    const mod = await freshModule();
    set.mockRejectedValue(new Error("could not be read back after saving"));
    await expect(mod.setCredential("GROQ_API_KEY", "abc")).rejects.toThrow(
      "could not be read back after saving"
    );
  });

  it("refuses on the web build rather than silently doing nothing", async () => {
    runningOnDevice(false);
    const mod = await freshModule();
    await expect(mod.setCredential("GROQ_API_KEY", "abc")).rejects.toThrow(/Android app/);
    expect(set).not.toHaveBeenCalled();
  });
});

describe("clearCredentials", () => {
  it("propagates a failed wipe rather than letting the UI claim the keys are gone", async () => {
    const mod = await freshModule();
    clearAll.mockRejectedValue(new Error("still stored on this device"));
    await expect(mod.clearCredentials()).rejects.toThrow("still stored on this device");
  });

  it("drops the cache after a successful wipe", async () => {
    const mod = await freshModule();
    getAll.mockResolvedValue({ GROQ_API_KEY: "abc" });
    await mod.loadCredentials();

    clearAll.mockResolvedValue(undefined);
    await mod.clearCredentials();

    getAll.mockResolvedValue({});
    expect(await mod.loadCredentials()).toEqual({});
  });
});

describe("diagnoseCredentialStore", () => {
  it("passes the native diagnosis through", async () => {
    const mod = await freshModule();
    diagnose.mockResolvedValue({ ok: false, canWrite: true, canReadBack: false, detail: "boom" });
    expect(await mod.diagnoseCredentialStore()).toMatchObject({ ok: false, detail: "boom" });
  });

  it("reports a not-ok result when the plugin itself is unreachable", async () => {
    const mod = await freshModule();
    diagnose.mockRejectedValue(new Error("no such plugin"));
    const health = await mod.diagnoseCredentialStore();
    expect(health.ok).toBe(false);
    expect(health.detail).toContain("no such plugin");
  });

  it("is a no-op success on the web build, which has no on-device store", async () => {
    runningOnDevice(false);
    const mod = await freshModule();
    expect((await mod.diagnoseCredentialStore()).ok).toBe(true);
    expect(diagnose).not.toHaveBeenCalled();
  });
});
