"use client";

import { useEffect, useState } from "react";
import { AlertOctagon, X, Copy } from "lucide-react";
import { getDeviceCapabilityProvider } from "@/lib/device/manager";
import type { LastExitInfo } from "@/lib/device/types";
import { isStandalone } from "@/lib/runtime/standalone";
import { useJarvisStore } from "@/store/jarvisStore";

/**
 * Reports why the app died the last time it was running.
 *
 * The app has been vanishing instantly — no dialog, no stack trace,
 * nothing to report — because the causes that do that (a native crash,
 * an ANR, the low-memory killer, a signal) are exactly the ones no
 * JavaScript or Kotlin error handler can catch. Android records them
 * anyway, in ActivityManager's process-exit history, so the app can read
 * back its own cause of death on the next launch and show it.
 *
 * The build identifier is included deliberately: a crash report is close
 * to useless without knowing which build produced it, and asking someone
 * to go and find a version number in Settings after their app just died
 * is asking too much.
 */
export function LastCrashBanner() {
  const [info, setInfo] = useState<LastExitInfo | null>(null);
  const [build, setBuild] = useState<string>("");
  const [dismissed, setDismissed] = useState(false);
  const pushToast = useJarvisStore((s) => s.pushToast);

  useEffect(() => {
    if (!isStandalone()) return;
    let alive = true;
    void (async () => {
      const exit = await getDeviceCapabilityProvider().getLastExitInfo();
      if (!alive || !exit.available) return;
      // Two independent signals: the process died (exit history), or the
      // renderer died and was recovered (no exit record exists for that).
      const worthReporting = (exit.hasExit && exit.abnormal) || Boolean(exit.rendererGoneAt);
      if (!worthReporting) return;
      setInfo(exit);
      try {
        const { App } = await import("@capacitor/app");
        const i = await App.getInfo();
        if (alive) setBuild(`${i.version} (${i.build})`);
      } catch {
        // Version is a nice-to-have; a crash report without it still beats
        // no crash report.
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (!info || dismissed) return null;

  const when = info.timestamp ? new Date(info.timestamp).toLocaleString() : "unknown time";
  const report = [
    `J.A.R.V.I.S crash report`,
    `Build:       ${build || "unknown"}`,
    `Last exit:   ${info.reason ?? "unknown"}`,
    `Reason code: ${info.reasonCode ?? "-"}`,
    `When:        ${when}`,
    `Detail:      ${info.description || "(none provided by Android)"}`,
    info.rendererGoneAt
      ? `Renderer:    ${info.rendererCrashed ? "crashed" : "killed for memory"} at ${new Date(info.rendererGoneAt).toLocaleString()}`
      : `Renderer:    no recorded fault`,
  ].join("\n");

  return (
    <div
      role="alert"
      className="mb-3 rounded-xl border border-danger/45 bg-danger/10 px-3 py-2.5 text-danger"
    >
      <div className="flex items-start gap-2.5">
        <AlertOctagon size={16} className="mt-0.5 shrink-0" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="font-technical text-[10px] tracking-[0.2em]">
            J.A.R.V.I.S CLOSED UNEXPECTEDLY
          </p>
          <p className="mt-1 text-[11px] leading-snug opacity-90">
            {info.reason ?? "The display process was lost and restarted."}
          </p>
          {info.rendererGoneAt ? (
            <p className="mt-0.5 text-[10px] leading-snug opacity-80">
              Display renderer {info.rendererCrashed ? "crashed" : "was killed to reclaim memory"} —
              recovered {new Date(info.rendererGoneAt).toLocaleString()}
            </p>
          ) : null}
          {info.description ? (
            <p className="mt-0.5 font-mono text-[10px] leading-snug break-words opacity-80">
              {info.description}
            </p>
          ) : null}
          <p className="mt-1 text-[10px] opacity-70">
            {when}
            {build ? ` · build ${build}` : ""}
          </p>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard
                ?.writeText(report)
                .then(() => pushToast("Crash report copied.", "success", "Diagnostics"))
                .catch(() => pushToast(report, "error", "Crash report"));
            }}
            className="font-technical mt-2 inline-flex items-center gap-1 rounded-lg border border-danger/40 px-2 py-1 text-[9px] tracking-[0.1em] transition-colors hover:border-danger"
          >
            <Copy size={10} aria-hidden />
            COPY REPORT
          </button>
        </div>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="Dismiss"
          className="shrink-0 opacity-70 hover:opacity-100"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
