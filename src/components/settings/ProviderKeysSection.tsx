"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { KeyRound, Check, Trash2, AlertTriangle, Loader2, XCircle, RotateCw } from "lucide-react";
import { SettingRow } from "./SettingRow";
import { BuildStamp } from "./BuildStamp";
import {
  CREDENTIAL_GROUPS,
  clearCredentials,
  diagnoseCredentialStore,
  getCredentialStatus,
  getCredentialTimestamps,
  isStandalone,
  setCredential,
  type CredentialKey,
  type CredentialStoreHealth,
} from "@/lib/runtime/standalone";
import { useJarvisStore } from "@/store/jarvisStore";
import { cn } from "@/lib/utils/cn";

/**
 * On-device provider keys — only rendered in the standalone Android app,
 * which has no server to hold them.
 *
 * This component never displays a stored key. It reads only status and
 * timestamps, which report *whether* and *when* each key was stored
 * without returning any value, so a secret can't be shoulder-surfed out
 * of Settings or end up in a screenshot. Entering a new value overwrites;
 * submitting an empty field clears that one key.
 *
 * Every visible state here is derived from a real answer from the
 * keystore. Nothing is optimistic: a field shows "saved" only after the
 * native side has written the value AND read it back decrypted, and a
 * save that fails says so in place, next to the field it belongs to.
 */

/** Per-field outcome. Deliberately keyed by field: a shared flag would
 * make one field's result appear to belong to another, and a result tied
 * to focus would vanish the moment the user looked at the next field. */
type FieldPhase =
  | { phase: "idle" }
  | { phase: "saving" }
  | { phase: "verifying" }
  | { phase: "saved"; at: number }
  | { phase: "cleared"; at: number }
  | { phase: "error"; message: string };

const IDLE: FieldPhase = { phase: "idle" };

function relativeTime(ts: number): string {
  const secs = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (secs < 45) return "just now";
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function ProviderKeysSection() {
  const pushToast = useJarvisStore((s) => s.pushToast);
  const [status, setStatus] = useState<Record<string, boolean>>({});
  const [savedAt, setSavedAt] = useState<Record<string, number>>({});
  const [drafts, setDrafts] = useState<Partial<Record<CredentialKey, string>>>({});
  const [phases, setPhases] = useState<Partial<Record<CredentialKey, FieldPhase>>>({});
  const [health, setHealth] = useState<CredentialStoreHealth | null>(null);
  const [verifiedAt, setVerifiedAt] = useState<number | null>(null);
  const [checking, setChecking] = useState(true);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const setPhase = useCallback((key: CredentialKey, next: FieldPhase) => {
    setPhases((p) => ({ ...p, [key]: next }));
  }, []);

  /**
   * Reads the real storage state. Called on every mount — never served
   * from a cache — because the whole question this screen answers is
   * "what is actually on this device right now".
   */
  const refresh = useCallback(async () => {
    setChecking(true);
    try {
      const [next, stamps] = await Promise.all([getCredentialStatus(), getCredentialTimestamps()]);
      if (!mounted.current) return;
      setStatus(next);
      setSavedAt(stamps);
      setVerifiedAt(Date.now());
      // Probe the store only when it claims nothing is stored — that is
      // the one case where "you haven't entered anything" and "the store
      // is broken" look identical, and the difference matters.
      setHealth(Object.values(next).some(Boolean) ? null : await diagnoseCredentialStore());
    } catch (err) {
      if (!mounted.current) return;
      setStatus({});
      setVerifiedAt(Date.now());
      setHealth({
        ok: false,
        detail:
          err instanceof Error ? err.message : "The secure credential store isn't reachable.",
      });
    } finally {
      if (mounted.current) setChecking(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // The web deployment keeps its secrets server-side in environment
  // variables, so offering on-device key entry there would be
  // meaningless and misleading.
  if (!isStandalone()) return null;

  async function save(key: CredentialKey) {
    const value = drafts[key] ?? "";
    const clearing = !value.trim();
    setPhase(key, { phase: "saving" });
    try {
      await setCredential(key, value);
      if (!mounted.current) return;
      // The native side only resolves after writing AND decrypting the
      // value back, so reaching here means it is genuinely on disk.
      setPhase(key, { phase: "verifying" });
      setDrafts((d) => ({ ...d, [key]: "" }));
      await refresh();
      if (!mounted.current) return;
      setPhase(key, clearing ? { phase: "cleared", at: Date.now() } : { phase: "saved", at: Date.now() });
      pushToast(clearing ? "Key cleared." : "Key saved and verified.", "success", "Providers");
    } catch (err) {
      if (!mounted.current) return;
      const message =
        err instanceof Error ? err.message : "The key could not be saved — it was not stored.";
      // Shown in place, next to the field it belongs to, and left there
      // until this field is saved again. A toast alone disappears after a
      // few seconds and takes the only evidence with it.
      setPhase(key, { phase: "error", message });
      pushToast(message, "error", "Providers");
      void diagnoseCredentialStore().then((h) => mounted.current && setHealth(h));
    }
  }

  async function forgetAll() {
    try {
      const { cleared, failed } = await clearCredentials();
      if (!mounted.current) return;
      setDrafts({});
      const now = Date.now();
      setPhases(() => {
        const next: Partial<Record<CredentialKey, FieldPhase>> = {};
        for (const k of cleared) next[k as CredentialKey] = { phase: "cleared", at: now };
        for (const k of failed)
          next[k as CredentialKey] = { phase: "error", message: "Still stored — could not be removed." };
        return next;
      });
      await refresh();
      if (failed.length) {
        pushToast(
          `${failed.length} key(s) could not be removed and are still on this device.`,
          "error",
          "Providers"
        );
      } else {
        pushToast(
          cleared.length ? `${cleared.length} key(s) removed from this device.` : "Nothing to remove.",
          "success",
          "Providers"
        );
      }
    } catch (err) {
      if (!mounted.current) return;
      pushToast(
        err instanceof Error ? err.message : "The keys could not be removed from this device.",
        "error",
        "Providers"
      );
      void refresh();
    }
  }

  const storeBroken = Boolean(health && !health.ok);

  return (
    <div>
      <p className="font-technical mt-6 mb-1 text-[10px] tracking-[0.15em] text-text-muted">
        PROVIDER KEYS
      </p>

      {storeBroken && (
        <div
          role="alert"
          className="mb-3 flex items-start gap-2.5 rounded-xl border border-danger/45 bg-danger/10 px-3 py-2.5 text-danger"
        >
          <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden />
          <div className="min-w-0">
            <p className="font-technical text-[10px] tracking-[0.2em]">KEY STORAGE UNAVAILABLE</p>
            <p className="mt-1 text-[11px] leading-snug opacity-90">
              {health?.detail ?? "Keys can't be saved on this device right now."}
            </p>
            <p className="mt-1 text-[10px] leading-snug opacity-75">
              Anything entered below would not persist, so this is reported rather than letting a save
              appear to succeed.
            </p>
          </div>
        </div>
      )}

      <p className="mb-2 text-[11px] leading-snug text-text-muted">
        This app runs entirely on your device — there is no server holding keys for you. Enter your own
        provider keys below and they are encrypted and stored on this device only, excluded from cloud
        backup. J.A.R.V.I.S still works without any of them: chat needs an AI key, but voice falls back to
        this device&apos;s built-in speech engines.
      </p>

      {/* Says plainly whether what's on screen reflects the device right
          now, so a stale screen can't be mistaken for a fresh one. */}
      <div className="mb-3 flex items-center gap-1.5 text-[10px] text-text-muted">
        {checking ? (
          <>
            <Loader2 size={11} className="animate-spin" aria-hidden />
            <span>Reading device storage…</span>
          </>
        ) : (
          <>
            <span>
              {verifiedAt ? `Storage checked ${relativeTime(verifiedAt)}` : "Storage not yet checked"}
            </span>
            <button
              type="button"
              onClick={() => void refresh()}
              className="font-technical ml-1 inline-flex items-center gap-1 rounded px-1.5 py-0.5 tracking-[0.1em] text-cyan/80 transition-colors hover:text-cyan"
            >
              <RotateCw size={10} aria-hidden />
              RECHECK
            </button>
          </>
        )}
      </div>

      {CREDENTIAL_GROUPS.map((group) => (
        <div key={group.label}>
          <p className="font-technical mt-4 mb-1 text-[10px] tracking-[0.15em] text-text-muted">
            {group.label.toUpperCase()}
          </p>
          {group.keys.map(({ key, label, hint }) => {
            // Reads ONLY this field's own entry. Interacting with a
            // different field cannot change what is rendered here.
            const state = phases[key] ?? IDLE;
            const inFlight = state.phase === "saving" || state.phase === "verifying";
            const stored = Boolean(status[key]);
            return (
              <SettingRow key={key} label={label} description={hint} stacked>
                <div className="w-full">
                  <div className="flex w-full items-center gap-2">
                    <div className="relative flex-1">
                      <KeyRound
                        size={13}
                        className={cn(
                          "absolute top-1/2 left-2.5 -translate-y-1/2",
                          state.phase === "error"
                            ? "text-danger"
                            : stored
                              ? "text-success"
                              : "text-text-muted"
                        )}
                        aria-hidden
                      />
                      <input
                        type="password"
                        value={drafts[key] ?? ""}
                        onChange={(e) => {
                          setDrafts((d) => ({ ...d, [key]: e.target.value }));
                          // Editing this field invalidates only this
                          // field's last result — never another's.
                          if (state.phase !== "idle") setPhase(key, IDLE);
                        }}
                        disabled={inFlight}
                        // Never pre-filled with the stored value — the
                        // placeholder only reports whether one exists.
                        placeholder={stored ? "Saved — enter a new value to replace" : "Not set"}
                        autoComplete="off"
                        spellCheck={false}
                        aria-label={label}
                        className={cn(
                          "w-full rounded-lg border bg-panel-strong py-1.5 pr-3 pl-8 text-sm text-text-primary outline-none",
                          state.phase === "error"
                            ? "border-danger/50 focus:border-danger"
                            : "border-cyan/20 focus:border-cyan/50"
                        )}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => void save(key)}
                      disabled={inFlight}
                      className={cn(
                        "font-technical shrink-0 rounded-lg border px-2.5 py-1.5 text-[10px] tracking-[0.15em] transition-colors disabled:opacity-60",
                        // Focus is styled separately from result, so
                        // "currently focused", "saved" and "failed" can
                        // never be mistaken for one another.
                        "focus-visible:ring-1 focus-visible:ring-cyan/70 focus-visible:outline-none",
                        state.phase === "error"
                          ? "border-danger/50 text-danger hover:border-danger"
                          : "border-cyan/25 text-cyan hover:border-cyan/60"
                      )}
                    >
                      {state.phase === "saving"
                        ? "SAVING"
                        : state.phase === "verifying"
                          ? "VERIFYING"
                          : "SAVE"}
                    </button>
                  </div>

                  {/* Exactly one of: in-flight, success, failure, or the
                      stored-since line. A save always lands on one of
                      these — it never just goes quiet. */}
                  <div className="mt-1 min-h-[15px] text-[10px] leading-snug">
                    {inFlight && (
                      <span className="flex items-center gap-1 text-cyan/80">
                        <Loader2 size={10} className="animate-spin" aria-hidden />
                        {state.phase === "saving"
                          ? "Writing to device keystore…"
                          : "Reading the value back to confirm…"}
                      </span>
                    )}
                    {state.phase === "saved" && (
                      <span className="flex items-center gap-1 text-success">
                        <Check size={11} aria-hidden />
                        Saved and verified on this device {relativeTime(state.at)}
                      </span>
                    )}
                    {state.phase === "cleared" && (
                      <span className="flex items-center gap-1 text-text-muted">
                        <Trash2 size={10} aria-hidden />
                        Cleared {relativeTime(state.at)}
                      </span>
                    )}
                    {state.phase === "error" && (
                      <span className="flex items-start gap-1 text-danger">
                        <XCircle size={11} className="mt-px shrink-0" aria-hidden />
                        <span>{state.message}</span>
                      </span>
                    )}
                    {state.phase === "idle" && stored && (
                      <span className="flex items-center gap-1 text-text-muted">
                        <Check size={11} className="text-success" aria-label="Configured" />
                        {savedAt[key] ? `Stored — saved ${relativeTime(savedAt[key])}` : "Stored on this device"}
                      </span>
                    )}
                  </div>
                </div>
              </SettingRow>
            );
          })}
        </div>
      ))}

      <SettingRow
        label="Forget all keys"
        description="Removes every provider key from this device. J.A.R.V.I.S falls back to demo mode and the built-in voice."
      >
        <button
          type="button"
          onClick={() => void forgetAll()}
          className="font-technical flex items-center gap-1.5 rounded-lg border border-danger/30 px-3 py-1.5 text-[10px] tracking-[0.15em] text-danger transition-colors hover:border-danger/60"
        >
          <Trash2 size={12} />
          CLEAR
        </button>
      </SettingRow>

      <BuildStamp />
    </div>
  );
}
