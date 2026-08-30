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

const getSavedAt = vi.fn();
const impl: Record<string, unknown> = { getAll, getStatus, set, clearAll, diagnose, getSavedAt };
const registerSpy = vi.fn();

/**
 * Capacitor's registerPlugin does NOT return a plain object — it returns a
 * Proxy whose `get` trap answers EVERY property with a callable, including
 * `then`. That detail is the whole point of this mock: with a plain object
 * the module under test passes trivially, while the real app hangs forever,
 * because returning a thenable from an `async` function makes the runtime
 * try to adopt it as a promise. Model the Proxy so the tests exercise what
 * actually ships.
 */
vi.mock("@capacitor/core", () => ({
  registerPlugin: (...args: unknown[]) => (
    registerSpy(...args),
    new Proxy(
      {},
      {
        get(_t, prop: string) {
          if (prop === "$$typeof") return undefined;
          if (prop in impl) return impl[prop];
          // Every other property — `then` included — is a method that
          // rejects, exactly as Capacitor does for an unimplemented one.
          return () =>
            Promise.reject(new Error(`"SecureCredentials.${prop}()" is not implemented on android`));
        },
      }
    )
  ),
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

describe("the plugin binding itself", () => {
  it("settles instead of hanging when the plugin object is a Capacitor Proxy", async () => {
    // Regression: `async function plugin() { return registerPlugin(...) }`
    // returned the Proxy directly. Because the Proxy answers `.then` with a
    // function, JS treated it as a thenable and called
    // `proxy.then(resolve, reject)` — which Capacitor answers with "not
    // implemented" and never invokes either callback. Every credential call
    // then hung forever: no value, no error, nothing rendered, and the
    // native plugin never reached. A timeout is the only way to assert
    // "does not hang", since a hang produces no observable event.
    const mod = await freshModule();
    getStatus.mockResolvedValue({ GROQ_API_KEY: true });

    const settled = await Promise.race([
      mod.getCredentialStatus().then(() => "settled" as const),
      new Promise<"hung">((r) => setTimeout(() => r("hung"), 1000)),
    ]);
    expect(settled).toBe("settled");
  });

  it("does not re-register the plugin on every call", async () => {
    const mod = await freshModule();
    getStatus.mockResolvedValue({});
    await mod.getCredentialStatus();
    await mod.getCredentialStatus();
    await mod.getCredentialStatus();
    // Capacitor warns "Cannot register plugins twice" and the repeated
    // dynamic import is pure overhead on a path used by every provider call.
    expect(registerSpy).toHaveBeenCalledTimes(1);
  });
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

  it("reports per key which were removed and which survived", async () => {
    const mod = await freshModule();
    clearAll.mockResolvedValue({ cleared: ["GROQ_API_KEY"], failed: ["OPENAI_API_KEY"] });
    await expect(mod.clearCredentials()).resolves.toEqual({
      cleared: ["GROQ_API_KEY"],
      failed: ["OPENAI_API_KEY"],
    });
  });

  it("drops the cache after a successful wipe", async () => {
    const mod = await freshModule();
    getAll.mockResolvedValue({ GROQ_API_KEY: "abc" });
    await mod.loadCredentials();

    clearAll.mockResolvedValue({ cleared: ["GROQ_API_KEY"], failed: [] });
    await mod.clearCredentials();

    getAll.mockResolvedValue({});
    expect(await mod.loadCredentials()).toEqual({});
  });
});

describe("getCredentialTimestamps", () => {
  it("returns the per-key save times", async () => {
    const mod = await freshModule();
    getSavedAt.mockResolvedValue({ GROQ_API_KEY: 1700000000000 });
    expect(await mod.getCredentialTimestamps()).toEqual({ GROQ_API_KEY: 1700000000000 });
  });

  it("degrades to empty rather than taking the whole screen down", async () => {
    // These timestamps are decoration on top of the real status answer.
    // An APK whose native plugin predates getSavedAt must still render a
    // working Provider Keys screen instead of reporting a healthy
    // keystore as broken.
    const mod = await freshModule();
    getSavedAt.mockRejectedValue(new Error('"SecureCredentials.getSavedAt()" is not implemented'));
    await expect(mod.getCredentialTimestamps()).resolves.toEqual({});
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
