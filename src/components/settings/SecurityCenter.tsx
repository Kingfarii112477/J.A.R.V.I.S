"use client";

import { useEffect, useState } from "react";
import { ShieldCheck, Clock, KeyRound, Wrench, ScrollText, Trash2 } from "lucide-react";
import { HudPanel } from "@/components/hud/HudPanel";
import { useJarvisStore } from "@/store/jarvisStore";
import { getRecentAuditEvents, clearAuditLog } from "@/lib/security/auditLog";
import { toolRegistry } from "@/lib/tools";
import { useEventListener } from "@/hooks/useEventListener";
import { cn } from "@/lib/utils/cn";
import type { AuditEvent } from "@/types/security";
import type { PermissionLevel } from "@/types/tools";

const PERMISSION_COLOR: Record<PermissionLevel, string> = {
  SAFE: "text-success border-success/30",
  CONFIRM: "text-warning border-warning/30",
  RESTRICTED: "text-orange border-orange/30",
  ADMIN: "text-danger border-danger/30",
};

function formatElapsed(ms: number) {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

function formatEventTime(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function SecurityCenter() {
  const sessionStartedAt = useJarvisStore((s) => s.sessionStartedAt);
  const lockScreenEnabled = useJarvisStore((s) => s.settings.lockScreenEnabled);
  const sessionTimeoutMinutes = useJarvisStore((s) => s.settings.sessionTimeoutMinutes);
  const auditLoggingEnabled = useJarvisStore((s) => s.settings.auditLoggingEnabled);
  const aiConnection = useJarvisStore((s) => s.aiConnection);
  const failedUnlockAttempts = useJarvisStore((s) => s.failedUnlockAttempts);

  const [now, setNow] = useState(() => Date.now());
  const [events, setEvents] = useState<AuditEvent[]>([]);

  useEffect(() => {
    setEvents(getRecentAuditEvents(20));
    const interval = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(interval);
  }, []);

  useEventListener("security.locked", () => setEvents(getRecentAuditEvents(20)));
  useEventListener("settings.changed", () => setEvents(getRecentAuditEvents(20)));

  function refreshEvents() {
    setEvents(getRecentAuditEvents(20));
  }

  function handleClear() {
    clearAuditLog();
    setEvents([]);
  }

  const tools = toolRegistry.list();

  return (
    <div className="mt-4 flex flex-col gap-4 border-t border-cyan/10 pt-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <HudPanel className="flex flex-col gap-1.5">
          <span className="font-technical flex items-center gap-1.5 text-[10px] tracking-[0.12em] text-text-secondary">
            <Clock size={12} /> SESSION STATUS
          </span>
          <span className="text-sm text-text-primary">Active for {formatElapsed(now - sessionStartedAt)}</span>
          <span className="text-xs text-text-muted">
            {lockScreenEnabled ? `Auto-lock after ${sessionTimeoutMinutes}m idle` : "Auto-lock disabled"}
          </span>
        </HudPanel>

        <HudPanel className="flex flex-col gap-1.5">
          <span className="font-technical flex items-center gap-1.5 text-[10px] tracking-[0.12em] text-text-secondary">
            <KeyRound size={12} /> AUTHENTICATION
          </span>
          <span className="text-sm text-text-primary">Demo passphrase (client-side only)</span>
          <span className={cn("text-xs", failedUnlockAttempts > 0 ? "text-warning" : "text-text-muted")}>
            {failedUnlockAttempts} failed unlock attempt{failedUnlockAttempts === 1 ? "" : "s"} this session
          </span>
        </HudPanel>

        <HudPanel className="flex flex-col gap-1.5">
          <span className="font-technical flex items-center gap-1.5 text-[10px] tracking-[0.12em] text-text-secondary">
            <ShieldCheck size={12} /> ACTIVE SESSIONS
          </span>
          <span className="text-sm text-text-primary">1 (this device)</span>
          <span className="text-xs text-text-muted">
            AI core: {aiConnection === "connected" ? "connected" : aiConnection === "error" ? "error" : "demo mode"}
          </span>
        </HudPanel>

        <HudPanel className="flex flex-col gap-1.5">
          <span className="font-technical flex items-center gap-1.5 text-[10px] tracking-[0.12em] text-text-secondary">
            <Wrench size={12} /> TOOL PERMISSIONS
          </span>
          <div className="flex flex-wrap gap-1">
            {tools.map((t) => (
              <span
                key={t.name}
                className={cn("font-technical rounded-full border px-1.5 py-0.5 text-[9px] tracking-[0.05em]", PERMISSION_COLOR[t.permission])}
                title={t.description}
              >
                {t.name}
              </span>
            ))}
          </div>
        </HudPanel>
      </div>

      <HudPanel className="p-0">
        <div className="flex items-center gap-2 border-b border-cyan/10 px-4 py-2.5">
          <ScrollText size={13} className="text-cyan" />
          <span className="font-technical text-[10px] tracking-[0.15em] text-text-secondary">AUDIT LOG</span>
          <span className="font-technical text-[9px] tracking-[0.08em] text-text-muted">
            {auditLoggingEnabled ? "RECORDING" : "DISABLED"}
          </span>
          <button
            type="button"
            onClick={refreshEvents}
            className="ml-auto font-technical text-[9px] tracking-[0.08em] text-text-muted hover:text-cyan"
          >
            REFRESH
          </button>
          <button
            type="button"
            onClick={handleClear}
            className="flex items-center gap-1 font-technical text-[9px] tracking-[0.08em] text-text-muted hover:text-danger"
          >
            <Trash2 size={11} /> CLEAR
          </button>
        </div>
        <div className="max-h-56 overflow-y-auto px-4 py-2">
          {events.length === 0 ? (
            <p className="font-technical py-4 text-center text-[10px] tracking-[0.1em] text-text-muted">NO AUDIT EVENTS YET</p>
          ) : (
            <ul className="divide-y divide-cyan/10">
              {events.map((e) => (
                <li key={e.id} className="flex items-center gap-2 py-2 text-xs">
                  <span className="font-technical w-16 shrink-0 text-[9px] text-text-muted">{formatEventTime(e.timestamp)}</span>
                  <span className="font-technical w-32 shrink-0 text-[9px] tracking-[0.05em] text-text-secondary">{e.type}</span>
                  <span className="flex-1 truncate text-text-primary">{e.detail ?? "—"}</span>
                  <span
                    className={cn(
                      "font-technical text-[9px] tracking-[0.06em]",
                      e.result === "success" ? "text-success" : e.result === "denied" ? "text-warning" : "text-danger"
                    )}
                  >
                    {e.result.toUpperCase()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </HudPanel>
    </div>
  );
}
