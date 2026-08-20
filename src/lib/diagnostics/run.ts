import { useJarvisStore } from "@/store/jarvisStore";
import type { SubsystemId } from "@/types/jarvis";

interface DiagnosticStep {
  label: string;
  subsystem: SubsystemId;
  line: string;
}

const steps: DiagnosticStep[] = [
  { label: "Neural core", subsystem: "neuralCore", line: "Neural core stable." },
  { label: "Voice systems", subsystem: "voiceSystem", line: "Voice systems operational." },
  { label: "Memory layer", subsystem: "memoryBank", line: "Memory layer synchronized." },
  { label: "Security grid", subsystem: "securityGrid", line: "Security grid nominal." },
  { label: "Quantum link", subsystem: "quantumLink", line: "Quantum link stable." },
  { label: "Tactical matrix", subsystem: "tacticalMatrix", line: "Tactical matrix calibrated." },
];

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let running = false;

/** Shared diagnostics sequence used by the Diagnostics screen's "Run Full
 * Diagnostics" button, the terminal's `run diagnostics` command, and chat /
 * voice command dispatch — one implementation, three entry points. */
export async function runFullDiagnostics(): Promise<number | null> {
  if (running) return null;
  running = true;

  const store = useJarvisStore.getState();
  const previousState = store.state;
  store.setState("DIAGNOSTICS");
  store.setDiagnostics({ diagnosticsRunning: true, diagnosticsProgress: 0 });
  store.pushTerminalLine({ kind: "system", text: "Running full neural diagnostics..." });

  for (let i = 0; i < steps.length; i++) {
    await delay(420 + Math.random() * 380);
    const step = steps[i];
    const progress = Math.round(((i + 1) / steps.length) * 100);
    useJarvisStore.getState().setDiagnostics({ diagnosticsProgress: progress });
    useJarvisStore.getState().setSubsystem(step.subsystem, {
      health: Math.min(100, 92 + Math.round(Math.random() * 8)),
      activity: Math.round(40 + Math.random() * 50),
    });
    useJarvisStore.getState().pushTerminalLine({ kind: "output", text: step.line });
  }

  const score = Math.round(93 + Math.random() * 7);
  useJarvisStore.getState().setDiagnostics({
    diagnosticsRunning: false,
    diagnosticsScore: score,
    lastDiagnosticsRun: Date.now(),
  });
  useJarvisStore.getState().pushTerminalLine({
    kind: "system",
    text: `Diagnostics complete. System health ${score}% — ${score >= 95 ? "EXCELLENT" : score >= 85 ? "GOOD" : "DEGRADED"}.`,
  });
  useJarvisStore.getState().setState(previousState === "DIAGNOSTICS" ? "IDLE" : previousState);

  running = false;
  return score;
}

export function isDiagnosticsRunning() {
  return running;
}
