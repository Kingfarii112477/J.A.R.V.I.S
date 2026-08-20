"use client";

import { useCallback } from "react";
import { useJarvisStore } from "@/store/jarvisStore";
import { playSound, type SoundCue } from "@/lib/audio/soundEngine";

export function useSound() {
  const soundEffects = useJarvisStore((s) => s.settings.soundEffects);
  const soundVolume = useJarvisStore((s) => s.settings.soundVolume);

  return useCallback(
    (cue: SoundCue) => playSound(cue, soundEffects, soundVolume),
    [soundEffects, soundVolume]
  );
}
