"use client";

import { useCallback, useEffect, useState } from "react";
import { KeyRound, Check, Trash2, AlertTriangle } from "lucide-react";
import { SettingRow } from "./SettingRow";
import {
  CREDENTIAL_GROUPS,
  clearCredentials,
  diagnoseCredentialStore,
  getCredentialStatus,
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
 * This component never displays a stored key. It reads only
 * `getCredentialStatus()`, which reports *whether* each key is set
 * without returning any value, so a secret can't be shoulder-surfed out
 * of Settings or end up in a screenshot. Entering a new value overwrites;
 * submitting an empty field clears that one key.
 */
export function ProviderKeysSection() {
  const pushToast = useJarvisStore((s) => s.pushToast);
  const [status, setStatus] = useState<Record<string, boolean>>({});
  const [drafts, setDrafts] = useState<Partial<Record<CredentialKey, string>>>({});
  const [busy, setBusy] = useState<CredentialKey | null>(null);
  const [health, setHealth] = useState<CredentialStoreHealth | null>(null);

  const refresh = useCallback(() => {
    getCredentialStatus()
      .then((next) => {
        setStatus(next);
        // Only probe the store when it reports nothing stored — that is
        // the exact situation where "you haven't entered anything" and
        // "the store is broken" look identical, and the user deserves to
        // know which one they're looking at.
        if (Object.values(next).some(Boolean)) {
          setHealth(null);
          return;
        }
        void diagnoseCredentialStore().then(setHealth);
      })
      .catch((err: unknown) => {
        setStatus({});
        setHealth({
          ok: false,
          detail: err instanceof Error ? err.message : "The secure credential store isn't reachable.",
        });
      });
  }, []);

  useEffect(refresh, [refresh]);

  // The web deployment keeps its secrets server-side in environment
  // variables, so offering on-device key entry there would be
  // meaningless and misleading.
  if (!isStandalone()) return null;

  async function save(key: CredentialKey) {
    const value = drafts[key] ?? "";
    setBusy(key);
    try {
      await setCredential(key, value);
      setDrafts((d) => ({ ...d, [key]: "" }));
      refresh();
      pushToast(value.trim() ? "Key saved on this device." : "Key cleared.", "success", "Providers");
    } catch (err) {
      // The native side only resolves after reading the value back, so a
      // rejection here means it genuinely did not persist. Say so.
      pushToast(
        err instanceof Error ? err.message : "Could not save that key — it was not stored.",
        "error",
        "Providers"
      );
      void diagnoseCredentialStore().then(setHealth);
    } finally {
      setBusy(null);
    }
  }

  async function forgetAll() {
    try {
      // Only claim the keys are gone once the native side confirms none
      // remain — announcing a wipe that didn't happen would leave secrets
      // on the device while the user believes otherwise.
      await clearCredentials();
      setDrafts({});
      refresh();
      pushToast("All provider keys removed from this device.", "success", "Providers");
    } catch (err) {
      pushToast(
        err instanceof Error ? err.message : "The keys could not be removed from this device.",
        "error",
        "Providers"
      );
      refresh();
    }
  }

  return (
    <div>
      <p className="font-technical mt-6 mb-1 text-[10px] tracking-[0.15em] text-text-muted">PROVIDER KEYS</p>
      {health && !health.ok && (
        <div className="mb-3 flex items-start gap-2.5 rounded-xl border border-danger/35 bg-danger/10 px-3 py-2 text-danger">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" aria-hidden />
          <div className="min-w-0">
            <p className="font-technical text-[10px] tracking-[0.2em]">KEY STORAGE UNAVAILABLE</p>
            <p className="mt-0.5 text-[11px] leading-snug opacity-90">
              {health.detail ?? "Keys can't be saved on this device right now."}
            </p>
            <p className="mt-1 text-[10px] leading-snug opacity-75">
              Keys entered here would not persist, so this is reported rather than letting a save appear
              to succeed.
            </p>
          </div>
        </div>
      )}

      <p className="mb-3 text-[11px] leading-snug text-text-muted">
        This app runs entirely on your device — there is no server holding keys for you. Enter your own
        provider keys below and they are encrypted and stored on this device only, excluded from cloud
        backup. J.A.R.V.I.S still works without any of them: chat needs an AI key, but voice falls back to
        this device&apos;s built-in speech engines.
      </p>

      {CREDENTIAL_GROUPS.map((group) => (
        <div key={group.label}>
          <p className="font-technical mt-4 mb-1 text-[10px] tracking-[0.15em] text-text-muted">
            {group.label.toUpperCase()}
          </p>
          {group.keys.map(({ key, label, hint }) => (
            <SettingRow key={key} label={label} description={hint} stacked>
              <div className="flex w-full items-center gap-2">
                <div className="relative flex-1">
                  <KeyRound
                    size={13}
                    className={cn(
                      "absolute top-1/2 left-2.5 -translate-y-1/2",
                      status[key] ? "text-success" : "text-text-muted"
                    )}
                    aria-hidden
                  />
                  <input
                    type="password"
                    value={drafts[key] ?? ""}
                    onChange={(e) => setDrafts((d) => ({ ...d, [key]: e.target.value }))}
                    // Never pre-filled with the stored value — the
                    // placeholder only reports whether one exists.
                    placeholder={status[key] ? "Saved — enter a new value to replace" : "Not set"}
                    autoComplete="off"
                    spellCheck={false}
                    aria-label={label}
                    className="w-full rounded-lg border border-cyan/20 bg-panel-strong py-1.5 pr-3 pl-8 text-sm text-text-primary outline-none focus:border-cyan/50"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => void save(key)}
                  disabled={busy === key}
                  className="font-technical shrink-0 rounded-lg border border-cyan/25 px-2.5 py-1.5 text-[10px] tracking-[0.15em] text-cyan transition-colors hover:border-cyan/60 disabled:opacity-50"
                >
                  {busy === key ? "…" : "SAVE"}
                </button>
                {status[key] && (
                  <Check size={14} className="shrink-0 text-success" aria-label="Configured" />
                )}
              </div>
            </SettingRow>
          ))}
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
    </div>
  );
}
