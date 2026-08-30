"use client";

import { useEffect, useState } from "react";
import { Smartphone } from "lucide-react";
import { isStandalone } from "@/lib/runtime/standalone";

/**
 * Shows which build is actually installed.
 *
 * Exists because "is the fix in the build I'm running?" was, for several
 * rounds, unanswerable: every APK carried the same versionCode, so a
 * reinstall looked identical to no reinstall. Reading the version from
 * the running package — rather than from a constant compiled into the web
 * bundle — means this reports the APK that Android actually installed.
 */
export function BuildStamp() {
  const [info, setInfo] = useState<{ version: string; build: string } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!isStandalone()) return;
    let alive = true;
    void (async () => {
      try {
        const { App } = await import("@capacitor/app");
        const i = await App.getInfo();
        if (alive) setInfo({ version: i.version, build: i.build });
      } catch {
        if (alive) setFailed(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (!isStandalone()) return null;

  return (
    <div className="mt-4 flex items-center gap-1.5 text-[10px] text-text-muted">
      <Smartphone size={11} aria-hidden />
      <span className="font-technical tracking-[0.1em]">
        {info
          ? `BUILD ${info.version} (${info.build})`
          : failed
            ? "BUILD UNKNOWN"
            : "BUILD …"}
      </span>
    </div>
  );
}
