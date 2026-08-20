"use client";

import { useEffect, useState, type ReactNode } from "react";
import { BootSequence } from "@/components/hud/BootSequence";
import { JarvisShell } from "@/components/layout/JarvisShell";
import { useJarvisStore } from "@/store/jarvisStore";
import { useTelemetryEngine } from "@/hooks/useTelemetry";
import { eventBus } from "@/lib/events/bus";

export function AppShellGate({ children }: { children: ReactNode }) {
  const booted = useJarvisStore((s) => s.booted);
  const setBooted = useJarvisStore((s) => s.setBooted);
  const setState = useJarvisStore((s) => s.setState);
  const skipBootAnimation = useJarvisStore((s) => s.settings.skipBootAnimation);
  const reducedMotion = useJarvisStore((s) => s.settings.reducedMotion);
  const setAiConnection = useJarvisStore((s) => s.setAiConnection);
  const [hydrated, setHydrated] = useState(false);

  useTelemetryEngine();

  useEffect(() => {
    setHydrated(true);
    eventBus.emit("jarvis.boot", {});
  }, []);

  useEffect(() => {
    fetch("/api/health")
      .then((res) => res.json())
      .then((data) => setAiConnection(data.aiConnection === "connected" ? "connected" : "demo"))
      .catch(() => setAiConnection("error"));
  }, [setAiConnection]);

  useEffect(() => {
    if (hydrated && skipBootAnimation && !booted) {
      setState("IDLE");
      setBooted(true);
      eventBus.emit("jarvis.ready", {});
    }
  }, [hydrated, skipBootAnimation, booted, setBooted, setState]);

  useEffect(() => {
    document.documentElement.setAttribute("data-reduced-motion", String(reducedMotion));
  }, [reducedMotion]);

  if (!hydrated) {
    return <div className="h-screen w-full bg-void" />;
  }

  if (!booted && !skipBootAnimation) {
    return (
      <BootSequence
        onComplete={() => {
          setState("IDLE");
          setBooted(true);
          eventBus.emit("jarvis.ready", {});
        }}
      />
    );
  }

  return <JarvisShell>{children}</JarvisShell>;
}
