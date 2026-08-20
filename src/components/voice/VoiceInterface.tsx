"use client";

import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Mic, MicOff, AlertTriangle, MessageSquare } from "lucide-react";
import { JarvisCore } from "@/components/3d/JarvisCore";
import { HudPanel } from "@/components/hud/HudPanel";
import { VoiceVisualizer } from "./VoiceVisualizer";
import { useVoice } from "@/hooks/useVoice";
import { useJarvisStore } from "@/store/jarvisStore";
import { stateLabel, stateDescription } from "@/hooks/useJarvisState";
import { textColor } from "@/components/common/StatusIndicator";
import { cn } from "@/lib/utils/cn";

export function VoiceInterface() {
  const router = useRouter();
  const { state, transcript, interim, levels, errorMsg, supported, startListening, stopAndSubmit, cancel } = useVoice();
  const quality = useJarvisStore((s) => s.settings.graphicsQuality);
  const voiceEnabled = useJarvisStore((s) => s.settings.voiceEnabled);
  const messages = useJarvisStore((s) => s.messages);

  const listening = state === "LISTENING";
  const busy = state === "THINKING" || state === "PROCESSING" || state === "SPEAKING";
  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant" && m.status !== "streaming");

  function handleTap() {
    if (listening) {
      stopAndSubmit();
    } else if (!busy) {
      startListening();
    } else {
      cancel();
    }
  }

  const avg = levels.reduce((s, v) => s + v, 0) / levels.length;
  const voiceLevelLabel = !listening ? "—" : avg > 0.45 ? "OPTIMAL" : avg > 0.12 ? "LOW SIGNAL" : "SILENT";

  return (
    <div className="flex flex-col items-center gap-4">
      {!voiceEnabled && (
        <HudPanel className="flex w-full items-center gap-2 border-warning/30 text-warning">
          <AlertTriangle size={16} />
          <span className="font-technical text-xs tracking-[0.05em]">
            Voice is disabled in Settings → Voice. Enable it to use this screen.
          </span>
        </HudPanel>
      )}

      {!supported && (
        <HudPanel className="flex w-full items-center gap-2 border-danger/30 text-danger">
          <AlertTriangle size={16} />
          <span className="font-technical text-xs tracking-[0.05em]">
            Speech recognition isn&apos;t supported in this browser. Try Chrome, Edge, or Safari.
          </span>
        </HudPanel>
      )}

      {errorMsg && (
        <HudPanel className="flex w-full items-center gap-2 border-danger/30 text-danger">
          <AlertTriangle size={16} />
          <span className="font-technical text-xs tracking-[0.05em]">{errorMsg}</span>
        </HudPanel>
      )}

      <HudPanel className="scanline-sweep relative flex w-full flex-col items-center overflow-hidden py-4">
        <div
          className="relative h-[280px] w-[280px] cursor-pointer sm:h-[320px] sm:w-[320px] lg:h-[400px] lg:w-[400px]"
          onClick={handleTap}
          role="button"
          tabIndex={0}
          aria-label={listening ? "Stop listening and send" : "Start listening"}
          onKeyDown={(e) => e.key === "Enter" && handleTap()}
        >
          <JarvisCore state={state} quality={quality} className="h-full w-full" />
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <motion.div
              animate={{ scale: listening ? [1, 1.08, 1] : 1 }}
              transition={{ repeat: listening ? Infinity : 0, duration: 1.4 }}
              className={cn(
                "flex h-16 w-16 items-center justify-center rounded-full border-2",
                listening ? "border-cyan text-cyan" : "border-white/50 text-white/80"
              )}
            >
              {listening ? <Mic size={26} /> : <MicOff size={24} />}
            </motion.div>
          </div>
        </div>

        <VoiceVisualizer levels={levels} active={listening} />

        <p className={cn("font-display mt-1 text-2xl tracking-[0.2em]", textColor[state])}>{stateLabel[state]}</p>
        <p className="font-technical mt-1 text-xs tracking-[0.1em] text-text-secondary">{stateDescription[state]}</p>

        {(transcript || interim) && (
          <div className="mt-4 w-full max-w-md rounded-xl border border-cyan/15 bg-panel-strong px-4 py-3 text-center">
            <p className="text-sm text-text-primary">
              {transcript}
              <span className="text-text-muted">{interim ? ` ${interim}` : ""}</span>
            </p>
          </div>
        )}

        {!listening && !busy && lastAssistant && (
          <button
            type="button"
            onClick={() => router.push("/chat")}
            className="font-technical mt-4 flex items-center gap-1.5 text-[10px] tracking-[0.1em] text-cyan hover:text-cyan-soft"
          >
            <MessageSquare size={12} /> VIEW FULL RESPONSE IN CHAT
          </button>
        )}
      </HudPanel>

      <div className="grid w-full grid-cols-3 gap-3">
        <HudPanel className="flex flex-col items-center gap-1 py-4 text-center">
          <span className="font-technical text-[10px] tracking-[0.15em] text-text-secondary">VOICE MODE</span>
          <span className={cn("font-technical mt-1 text-xs tracking-[0.1em]", voiceEnabled ? "text-success" : "text-text-muted")}>
            {voiceEnabled ? "ACTIVE" : "DISABLED"}
          </span>
        </HudPanel>
        <HudPanel className="flex flex-col items-center gap-1 py-4 text-center">
          <span className="font-technical text-[10px] tracking-[0.15em] text-text-secondary">NOISE FILTER</span>
          <span className="font-technical mt-1 text-xs tracking-[0.1em] text-success">ON</span>
        </HudPanel>
        <HudPanel className="flex flex-col items-center gap-1 py-4 text-center">
          <span className="font-technical text-[10px] tracking-[0.15em] text-text-secondary">VOICE LEVEL</span>
          <span className="font-technical mt-1 text-xs tracking-[0.1em] text-cyan">{voiceLevelLabel}</span>
        </HudPanel>
      </div>
    </div>
  );
}
