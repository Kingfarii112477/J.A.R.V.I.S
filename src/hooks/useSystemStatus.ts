"use client";

import { useEffect, useRef } from "react";
import { Capacitor } from "@capacitor/core";
import { useJarvisStore } from "@/store/jarvisStore";
import { computeSystemStatus, systemStatusLabel, systemStatusDescription, type SystemStatus } from "@/lib/system/status";
import { getNetworkOnline, subscribeNetworkStatus } from "@/lib/system/network";
import { subscribeAppLifecycle } from "@/lib/system/lifecycle";
import { checkAiHealth } from "@/lib/system/health";
import { probeDeviceBridgeHealth } from "@/lib/system/deviceBridgeHealth";

/**
 * Mounted exactly once, at the app root (see AppShellGate.tsx) — owns
 * every side effect behind the system-status picture:
 *
 *  - Live network connectivity tracking, wired to the JarvisState
 *    machine's OFFLINE state — goOffline()/restorePrevious() have existed
 *    since Phase 1's state machine, but nothing ever actually called
 *    goOffline() until this. Forces OFFLINE the instant real connectivity
 *    drops (guarded to only run once booted, so it never fights the boot
 *    animation) and restores whatever state was active the instant it
 *    returns.
 *  - Re-verifying AI backend reachability and native device-bridge health
 *    whenever the app returns to the foreground (a "warm start"), not
 *    just once at cold start — Android can background this app for
 *    arbitrarily long, during which connectivity or the backend's own
 *    health can change without any event firing while backgrounded.
 *
 * All of it writes into the store (networkOnline, deviceBridgeHealthy,
 * aiConnection) rather than local state, specifically so any number of
 * OTHER components can read the resulting status via useSystemStatusValue
 * below without re-mounting these subscriptions themselves.
 */
export function useSystemStatus(): void {
  const booted = useJarvisStore((s) => s.booted);
  const networkOnline = useJarvisStore((s) => s.networkOnline);
  const setNetworkOnline = useJarvisStore((s) => s.setNetworkOnline);
  const setAiConnection = useJarvisStore((s) => s.setAiConnection);
  const setDeviceBridgeHealthy = useJarvisStore((s) => s.setDeviceBridgeHealthy);
  const wasOfflineRef = useRef(false);

  // Initial + live connectivity probe.
  useEffect(() => {
    let cancelled = false;
    void getNetworkOnline().then((online) => {
      if (!cancelled) setNetworkOnline(online);
    });
    const unsubscribe = subscribeNetworkStatus((online) => {
      if (!cancelled) setNetworkOnline(online);
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [setNetworkOnline]);

  // Drive the JarvisState machine's OFFLINE state from real connectivity.
  // Reads the live state via getState() (rather than subscribing to
  // `state` as a render dependency) so this effect only re-runs on an
  // actual online/offline transition — subscribing to `state` here would
  // re-fire on every unrelated LISTENING/THINKING/etc. transition while
  // offline and repeatedly overwrite previousState with "OFFLINE" itself,
  // permanently losing what to restore to.
  useEffect(() => {
    if (!booted) return;
    const { state, setState } = useJarvisStore.getState();
    if (!networkOnline) {
      if (!wasOfflineRef.current) {
        wasOfflineRef.current = true;
        setState("OFFLINE");
      }
      return;
    }
    if (wasOfflineRef.current) {
      wasOfflineRef.current = false;
      if (state === "OFFLINE") {
        const { previousState } = useJarvisStore.getState();
        setState(previousState === "OFFLINE" ? "IDLE" : previousState);
      }
    }
  }, [booted, networkOnline]);

  // Native device-bridge probe: once on mount (native only) and again on
  // every foreground resume.
  useEffect(() => {
    let cancelled = false;
    const probe = async () => {
      const healthy = await probeDeviceBridgeHealth();
      if (!cancelled) setDeviceBridgeHealthy(healthy);
    };
    void probe();
    const unsubscribe = subscribeAppLifecycle({
      onForeground: () => {
        void probe();
        void checkAiHealth().then((result) => {
          if (!cancelled) setAiConnection(result);
        });
        void getNetworkOnline().then((online) => {
          if (!cancelled) setNetworkOnline(online);
        });
      },
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [setAiConnection, setDeviceBridgeHealthy, setNetworkOnline]);
}

/** Cheap, side-effect-free read of the current composite SystemStatus —
 * safe to call from as many components as need it (TopBar, Settings,
 * Diagnostics, ...) since it only selects existing store state; the
 * actual probing/subscribing lives solely in useSystemStatus above. */
export function useSystemStatusValue(): { status: SystemStatus; label: string; description: string } {
  const networkOnline = useJarvisStore((s) => s.networkOnline);
  const aiConnection = useJarvisStore((s) => s.aiConnection);
  const deviceBridgeHealthy = useJarvisStore((s) => s.deviceBridgeHealthy);
  const micPermissionDenied = useJarvisStore((s) => s.micPermissionDenied);

  const status = computeSystemStatus({
    networkOnline,
    aiConnection,
    isNativePlatform: Capacitor.isNativePlatform(),
    deviceBridgeHealthy,
    micPermissionDenied,
  });

  return { status, label: systemStatusLabel[status], description: systemStatusDescription[status] };
}
