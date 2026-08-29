"use client";

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Menu, AudioWaveform } from "lucide-react";
import { NavDrawer } from "./NavDrawer";
import { StatusIndicator } from "@/components/common/StatusIndicator";
import { navItems } from "@/config/navigation";
import { useJarvisStore } from "@/store/jarvisStore";
import { useSystemStatusValue } from "@/hooks/useSystemStatus";
import { cn } from "@/lib/utils/cn";

/** Every status handled by an existing indicator (StatusIndicator's own
 * OFFLINE dot, or the long-standing DEMO badge below for aiConnection ===
 * "demo") is deliberately excluded here — this badge only ever surfaces
 * the honest statuses that had no visible UI before Phase 6. */
const BADGE_STATUSES = new Set(["VOICE_UNAVAILABLE", "DEVICE_BRIDGE_UNAVAILABLE", "AI_PROVIDER_UNAVAILABLE"]);

export function TopBar() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const state = useJarvisStore((s) => s.state);
  const aiConnection = useJarvisStore((s) => s.aiConnection);
  const { status: systemStatus, label: systemStatusLabel } = useSystemStatusValue();

  const current = navItems.find((item) => item.href === pathname);
  const title = current ? current.label.toUpperCase() : "J.A.R.V.I.S.";

  return (
    <>
      <header className="hud-panel sticky top-3 z-20 mb-4 flex items-center justify-between rounded-2xl px-4 py-3">
        <button
          type="button"
          aria-label="Open system menu"
          onClick={() => setDrawerOpen(true)}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-panel-strong hover:text-text-primary"
        >
          <Menu size={20} />
        </button>

        <div className="flex flex-col items-center">
          <h1 className="font-display text-sm tracking-[0.3em] text-text-primary sm:text-base">
            {title === "DASHBOARD" ? "J.A.R.V.I.S." : title.split("").join(".")}
          </h1>
          <div className="mt-0.5 flex items-center gap-2">
            <StatusIndicator state={state} size="sm" />
            {aiConnection === "demo" && (
              <span className="font-technical rounded-full border border-warning/30 bg-warning/10 px-1.5 py-0.5 text-[9px] tracking-[0.15em] text-warning">
                DEMO
              </span>
            )}
            {BADGE_STATUSES.has(systemStatus) && (
              <span
                className="font-technical rounded-full border border-danger/30 bg-danger/10 px-1.5 py-0.5 text-[9px] tracking-[0.15em] text-danger"
                title={systemStatusLabel}
              >
                {systemStatusLabel}
              </span>
            )}
          </div>
        </div>

        <button
          type="button"
          aria-label="Quick voice activation"
          onClick={() => router.push("/voice")}
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-full border transition-colors",
            state === "LISTENING"
              ? "border-cyan text-cyan animate-pulse-slow"
              : "border-cyan/30 text-cyan/80 hover:border-cyan hover:text-cyan"
          )}
        >
          <AudioWaveform size={16} />
        </button>
      </header>

      <NavDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </>
  );
}
