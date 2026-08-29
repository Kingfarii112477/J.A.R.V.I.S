"use client";

import { useState, useEffect } from "react";
import {
  Settings as SettingsIcon,
  Palette,
  Mic,
  BrainCircuit,
  Shield,
  Bell,
  Share2,
  RotateCcw,
} from "lucide-react";
import { JarvisCore } from "@/components/3d/JarvisCore";
import { HudPanel } from "@/components/hud/HudPanel";
import { Modal } from "@/components/common/Modal";
import { SettingRow } from "./SettingRow";
import { ToggleSwitch } from "./ToggleSwitch";
import { SliderControl } from "./SliderControl";
import { SecurityCenter } from "./SecurityCenter";
import { useJarvisStore, defaultSettings } from "@/store/jarvisStore";
import { useJarvisState } from "@/hooks/useJarvisState";
import { useVoiceProviderStatus, type VoiceProviderStatus } from "@/hooks/useVoiceProviderStatus";
import { cn } from "@/lib/utils/cn";
import { logAuditEvent } from "@/lib/security/auditLog";
import { eventBus } from "@/lib/events/bus";
import { listAutomations } from "@/lib/automation/client";
import type { JarvisSettings } from "@/types/jarvis";

const TABS = [
  { id: "general", label: "General", icon: SettingsIcon },
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "voice", label: "Voice & Language", icon: Mic },
  { id: "ai", label: "AI Behavior", icon: BrainCircuit },
  { id: "security", label: "Security", icon: Shield },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "advanced", label: "Advanced", icon: Share2 },
] as const;

type TabId = (typeof TABS)[number]["id"];

const selectClass =
  "rounded-lg border border-cyan/20 bg-panel-strong px-3 py-1.5 text-sm text-text-primary outline-none focus:border-cyan/50";

function Select({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={selectClass}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

const PROVIDER_STATUS_LABEL: Record<VoiceProviderStatus, string> = { REAL: "CONNECTED", FALLBACK: "FALLBACK", UNAVAILABLE: "UNAVAILABLE" };
const PROVIDER_STATUS_COLOR: Record<VoiceProviderStatus, string> = { REAL: "text-success", FALLBACK: "text-warning", UNAVAILABLE: "text-danger" };

/** Never reveals whether a key is present or valid beyond this badge —
 * see GET /api/voice/status, which itself never returns key values. */
function ProviderStatusBadge({ status }: { status: VoiceProviderStatus }) {
  return <span className={cn("font-technical text-[10px] tracking-[0.08em]", PROVIDER_STATUS_COLOR[status])}>{PROVIDER_STATUS_LABEL[status]}</span>;
}

export function SettingsPanel() {
  const settings = useJarvisStore((s) => s.settings);
  const updateSettings = useJarvisStore((s) => s.updateSettings);
  const resetSettings = useJarvisStore((s) => s.resetSettings);
  const secured = useJarvisStore((s) => s.secured);
  const setSecured = useJarvisStore((s) => s.setSecured);
  const aiConnection = useJarvisStore((s) => s.aiConnection);
  const pushToast = useJarvisStore((s) => s.pushToast);
  const { state } = useJarvisState();
  const { sttStatus, ttsStatus } = useVoiceProviderStatus();

  const [activeTab, setActiveTab] = useState<TabId>("general");
  const [resetOpen, setResetOpen] = useState(false);
  const [n8nConnected, setN8nConnected] = useState<boolean | null>(null);

  useEffect(() => {
    listAutomations().then((workflows) => setN8nConnected(workflows.length > 0));
  }, []);

  function set<K extends keyof JarvisSettings>(key: K, value: JarvisSettings[K]) {
    updateSettings({ [key]: value } as Partial<JarvisSettings>);
    logAuditEvent({ type: "SETTINGS_CHANGE", source: "settings", result: "success", detail: key });
    eventBus.emit("settings.changed", { keys: [key] });
  }

  function handleReset() {
    resetSettings();
    setResetOpen(false);
    pushToast("Settings restored to defaults.", "success");
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[220px_1fr]">
        <HudPanel className="flex gap-1 overflow-x-auto p-2 lg:flex-col lg:overflow-visible">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm transition-colors",
                  active ? "border border-cyan/30 bg-cyan/10 text-cyan" : "border border-transparent text-text-secondary hover:bg-panel-strong"
                )}
              >
                <Icon size={15} />
                <span className="font-technical whitespace-nowrap tracking-[0.06em]">{tab.label.toUpperCase()}</span>
              </button>
            );
          })}
        </HudPanel>

        <HudPanel>
          {activeTab === "general" && (
            <div>
              <SettingRow label="AI Name">
                <input
                  value={settings.aiName}
                  onChange={(e) => set("aiName", e.target.value)}
                  className={selectClass}
                  maxLength={40}
                />
              </SettingRow>
              <SettingRow label="Language">
                <Select
                  value={settings.language}
                  onChange={(v) => set("language", v)}
                  options={["English", "Spanish", "French", "German", "Japanese"].map((l) => ({ value: l, label: l }))}
                />
              </SettingRow>
              <SettingRow label="Theme">
                <Select
                  value={settings.theme}
                  onChange={(v) => set("theme", v as JarvisSettings["theme"])}
                  options={[
                    { value: "cybernetic-blue", label: "Cybernetic Blue" },
                    { value: "crimson-protocol", label: "Crimson Protocol" },
                    { value: "violet-nexus", label: "Violet Nexus" },
                  ]}
                />
              </SettingRow>
              <SettingRow label="Holographic Effects" description="Bloom, glow, and scanline overlays">
                <ToggleSwitch checked={settings.holographicEffects} onChange={(v) => set("holographicEffects", v)} label="Holographic Effects" />
              </SettingRow>
              <SettingRow label="Interface Opacity" description={`${settings.interfaceOpacity}%`} stacked>
                <SliderControl
                  value={settings.interfaceOpacity}
                  min={40}
                  max={100}
                  onChange={(v) => set("interfaceOpacity", v)}
                  ariaLabel="Interface opacity"
                />
              </SettingRow>
              <SettingRow label="Animations">
                <ToggleSwitch checked={settings.animations} onChange={(v) => set("animations", v)} label="Animations" />
              </SettingRow>
              <SettingRow label="Data Analytics" description="Local-only usage insights">
                <ToggleSwitch checked={settings.dataAnalytics} onChange={(v) => set("dataAnalytics", v)} label="Data Analytics" />
              </SettingRow>
            </div>
          )}

          {activeTab === "appearance" && (
            <div>
              <SettingRow label="Graphics Quality" description="Particle density & bloom">
                <Select
                  value={settings.graphicsQuality}
                  onChange={(v) => set("graphicsQuality", v as JarvisSettings["graphicsQuality"])}
                  options={[
                    { value: "low", label: "Low" },
                    { value: "balanced", label: "Balanced" },
                    { value: "high", label: "High" },
                    { value: "ultra", label: "Ultra" },
                  ]}
                />
              </SettingRow>
              <SettingRow label="Reduced Motion" description="Minimize non-essential animation">
                <ToggleSwitch checked={settings.reducedMotion} onChange={(v) => set("reducedMotion", v)} label="Reduced Motion" />
              </SettingRow>
              <SettingRow label="Boot Animation" description="Play cinematic sequence on launch">
                <ToggleSwitch checked={!settings.skipBootAnimation} onChange={(v) => set("skipBootAnimation", !v)} label="Boot Animation" />
              </SettingRow>
            </div>
          )}

          {activeTab === "voice" && (
            <div>
              <SettingRow label="Voice Enabled">
                <ToggleSwitch checked={settings.voiceEnabled} onChange={(v) => set("voiceEnabled", v)} label="Voice Enabled" />
              </SettingRow>
              <SettingRow label="Auto Speak" description="Read AI responses aloud">
                <ToggleSwitch checked={settings.autoSpeak} onChange={(v) => set("autoSpeak", v)} label="Auto Speak" />
              </SettingRow>
              <SettingRow label="Interrupt (Barge-In)" description="Tapping the mic while J.A.R.V.I.S is speaking stops it immediately">
                <ToggleSwitch checked={settings.voiceInterruptEnabled} onChange={(v) => set("voiceInterruptEnabled", v)} label="Interrupt enabled" />
              </SettingRow>
              <SettingRow label="Voice Confirmations" description="Speak CONFIRM-level tool requests aloud and accept a spoken yes/no">
                <ToggleSwitch checked={settings.voiceConfirmationsEnabled} onChange={(v) => set("voiceConfirmationsEnabled", v)} label="Voice confirmations" />
              </SettingRow>
              <SettingRow
                label="Activation Mode"
                description={
                  settings.wakeWordMode === "wake-word"
                    ? 'Listens for "Jarvis" while this screen is open and the mic is already granted — foreground only, never a background service'
                    : "An explicit tap/press starts the mic — always-on listening isn't offered"
                }
              >
                <Select
                  value={settings.wakeWordMode}
                  onChange={(v) => set("wakeWordMode", v as JarvisSettings["wakeWordMode"])}
                  options={[
                    { value: "click-to-talk", label: "Click to Talk" },
                    { value: "push-to-talk", label: "Push to Talk" },
                    { value: "wake-word", label: 'Wake Word ("Jarvis") — foreground only' },
                  ]}
                />
              </SettingRow>

              <p className="font-technical mt-6 mb-1 text-[10px] tracking-[0.15em] text-text-muted">LANGUAGE</p>
              <SettingRow label="Auto Language Detection" description="Detect English / Urdu / Hindi / Roman Urdu / Hinglish automatically">
                <ToggleSwitch checked={settings.autoLanguageDetection} onChange={(v) => set("autoLanguageDetection", v)} label="Auto language detection" />
              </SettingRow>
              <SettingRow label="Preferred Language" description="Overrides detection when set to anything but Auto">
                <Select
                  value={settings.preferredLanguage}
                  onChange={(v) => set("preferredLanguage", v as JarvisSettings["preferredLanguage"])}
                  options={[
                    { value: "auto", label: "Auto (recommended)" },
                    { value: "en", label: "English" },
                    { value: "ur", label: "Urdu" },
                    { value: "hi", label: "Hindi" },
                  ]}
                />
              </SettingRow>

              <p className="font-technical mt-6 mb-1 text-[10px] tracking-[0.15em] text-text-muted">SPEECH RECOGNITION</p>
              <SettingRow label="Auto-Submit Speech" description="Automatically send once you stop talking, instead of requiring a manual tap">
                <ToggleSwitch checked={settings.autoSubmitSpeech} onChange={(v) => set("autoSubmitSpeech", v)} label="Auto-submit speech" />
              </SettingRow>
              <SettingRow label="Silence Timeout" description={`${(settings.silenceTimeoutMs / 1000).toFixed(1)}s of silence before auto-submitting`} stacked>
                <SliderControl
                  value={settings.silenceTimeoutMs}
                  min={500}
                  max={4000}
                  step={100}
                  onChange={(v) => set("silenceTimeoutMs", v)}
                  ariaLabel="Silence timeout"
                />
              </SettingRow>
              <SettingRow label="Speech-to-Text Provider" description="Browser works with no setup; Whisper/AssemblyAI need a server key and fall back automatically if missing">
                <div className="flex items-center gap-2">
                  <Select
                    value={settings.sttProvider}
                    onChange={(v) => set("sttProvider", v as JarvisSettings["sttProvider"])}
                    options={[
                      { value: "browser", label: "Browser (built-in)" },
                      { value: "whisper", label: "Whisper (OpenAI)" },
                      { value: "assemblyai", label: "AssemblyAI" },
                    ]}
                  />
                  <ProviderStatusBadge status={sttStatus} />
                </div>
              </SettingRow>

              <p className="font-technical mt-6 mb-1 text-[10px] tracking-[0.15em] text-text-muted">SPEECH SYNTHESIS</p>
              <SettingRow label="Text-to-Speech Provider" description="Browser works with no setup; Azure/OpenAI/ElevenLabs need a server key and fall back automatically if missing">
                <div className="flex items-center gap-2">
                  <Select
                    value={settings.ttsProvider}
                    onChange={(v) => set("ttsProvider", v as JarvisSettings["ttsProvider"])}
                    options={[
                      { value: "browser", label: "Browser (built-in)" },
                      { value: "azure", label: "Azure AI Speech" },
                      { value: "openai", label: "OpenAI TTS" },
                      { value: "elevenlabs", label: "ElevenLabs" },
                    ]}
                  />
                  <ProviderStatusBadge status={ttsStatus} />
                </div>
              </SettingRow>
              <SettingRow label="Voice Rate" description={settings.voiceRate.toFixed(1) + "x"} stacked>
                <SliderControl value={settings.voiceRate} min={0.5} max={1.8} step={0.1} onChange={(v) => set("voiceRate", v)} ariaLabel="Voice rate" />
              </SettingRow>
              <SettingRow label="Voice Pitch" description={settings.voicePitch.toFixed(1)} stacked>
                <SliderControl value={settings.voicePitch} min={0.5} max={1.8} step={0.1} onChange={(v) => set("voicePitch", v)} ariaLabel="Voice pitch" />
              </SettingRow>
              <SettingRow label="Voice Volume" description={`${settings.voiceVolume}%`} stacked>
                <SliderControl value={settings.voiceVolume} min={0} max={100} onChange={(v) => set("voiceVolume", v)} ariaLabel="Voice volume" />
              </SettingRow>

              <p className="font-technical mt-6 mb-1 text-[10px] tracking-[0.15em] text-text-muted">INTERFACE SOUND</p>
              <SettingRow label="Sound Effects" description="UI clicks & notification pulses">
                <ToggleSwitch checked={settings.soundEffects} onChange={(v) => set("soundEffects", v)} label="Sound Effects" />
              </SettingRow>
              <SettingRow label="Sound Volume" description={`${settings.soundVolume}%`} stacked>
                <SliderControl value={settings.soundVolume} min={0} max={100} onChange={(v) => set("soundVolume", v)} ariaLabel="Sound volume" />
              </SettingRow>
            </div>
          )}

          {activeTab === "ai" && (
            <div>
              <SettingRow label="Response Style">
                <Select
                  value={settings.aiPersonalityVerbosity}
                  onChange={(v) => set("aiPersonalityVerbosity", v as JarvisSettings["aiPersonalityVerbosity"])}
                  options={[
                    { value: "concise", label: "Concise" },
                    { value: "balanced", label: "Balanced" },
                    { value: "detailed", label: "Detailed" },
                  ]}
                />
              </SettingRow>
              <SettingRow label="Preferred Address" description="How J.A.R.V.I.S addresses you">
                <input
                  value={settings.aiAddressUser}
                  onChange={(e) => set("aiAddressUser", e.target.value)}
                  placeholder="Default"
                  className={cn(selectClass, "w-36")}
                  maxLength={30}
                />
              </SettingRow>
              <SettingRow label="Proactive Suggestions" description="Offer relevant actions unprompted">
                <ToggleSwitch checked={settings.proactiveSuggestions} onChange={(v) => set("proactiveSuggestions", v)} label="Proactive Suggestions" />
              </SettingRow>
            </div>
          )}

          {activeTab === "security" && (
            <div>
              <SettingRow label="Lock Screen" description="Require passphrase to resume session">
                <ToggleSwitch checked={settings.lockScreenEnabled} onChange={(v) => set("lockScreenEnabled", v)} label="Lock Screen" />
              </SettingRow>
              <SettingRow label="Session Timeout" description={`${settings.sessionTimeoutMinutes} min`} stacked>
                <SliderControl
                  value={settings.sessionTimeoutMinutes}
                  min={5}
                  max={60}
                  step={5}
                  onChange={(v) => set("sessionTimeoutMinutes", v)}
                  ariaLabel="Session timeout"
                />
              </SettingRow>
              <SettingRow label="Quantum Encryption" description="Simulated protocol — always on for this build">
                <ToggleSwitch checked={secured} onChange={setSecured} label="Quantum Encryption" />
              </SettingRow>
              <SettingRow label="Strict Tool Confirmation" description="Require confirmation for every tool, even SAFE ones">
                <ToggleSwitch checked={settings.strictToolConfirmation} onChange={(v) => set("strictToolConfirmation", v)} label="Strict Tool Confirmation" />
              </SettingRow>
              <SettingRow label="Audit Logging" description="Record AI/tool/memory/settings events locally">
                <ToggleSwitch checked={settings.auditLoggingEnabled} onChange={(v) => set("auditLoggingEnabled", v)} label="Audit Logging" />
              </SettingRow>
              <SecurityCenter />
            </div>
          )}

          {activeTab === "notifications" && (
            <div>
              <SettingRow label="Notifications Enabled">
                <ToggleSwitch checked={settings.notificationsEnabled} onChange={(v) => set("notificationsEnabled", v)} label="Notifications Enabled" />
              </SettingRow>
              <SettingRow label="Threat Alerts" description="Notify on radar-classified threats">
                <ToggleSwitch checked={settings.notifyOnThreat} onChange={(v) => set("notifyOnThreat", v)} label="Threat Alerts" />
              </SettingRow>
              <SettingRow label="Diagnostics Complete" description="Notify when a diagnostic run finishes">
                <ToggleSwitch checked={settings.notifyOnDiagnostics} onChange={(v) => set("notifyOnDiagnostics", v)} label="Diagnostics Complete" />
              </SettingRow>
            </div>
          )}

          {activeTab === "advanced" && (
            <div>
              <SettingRow label="AI Connection" description="Read-only status">
                <span
                  className={cn(
                    "font-technical text-xs tracking-[0.1em]",
                    aiConnection === "connected" ? "text-success" : aiConnection === "error" ? "text-danger" : "text-warning"
                  )}
                >
                  {aiConnection.toUpperCase()}
                </span>
              </SettingRow>
              <SettingRow label="N8N Automation" description="Read-only status">
                <span
                  className={cn(
                    "font-technical text-xs tracking-[0.1em]",
                    n8nConnected === null ? "text-text-muted" : n8nConnected ? "text-success" : "text-text-muted"
                  )}
                >
                  {n8nConnected === null ? "CHECKING…" : n8nConnected ? "CONNECTED" : "NOT CONNECTED"}
                </span>
              </SettingRow>
              <SettingRow label="Memory Provider" description="Where stored memory records live">
                <Select
                  value={settings.memoryProvider}
                  onChange={(v) => set("memoryProvider", v as JarvisSettings["memoryProvider"])}
                  options={[
                    { value: "local", label: "Local (browser storage)" },
                    { value: "supabase", label: "Supabase (Postgres)" },
                    { value: "vector", label: "Vector search (not yet available)" },
                  ]}
                />
              </SettingRow>
              <SettingRow label="Debug Mode" description="Verbose console logging">
                <ToggleSwitch checked={settings.debugMode} onChange={(v) => set("debugMode", v)} label="Debug Mode" />
              </SettingRow>
              <div className="pt-4">
                <button
                  type="button"
                  onClick={() => setResetOpen(true)}
                  className="flex items-center gap-2 rounded-lg border border-danger/30 px-4 py-2.5 text-sm text-danger transition-colors hover:bg-danger/10"
                >
                  <RotateCcw size={15} /> RESET SETTINGS
                </button>
              </div>
            </div>
          )}
        </HudPanel>
      </div>

      <HudPanel className="scanline-sweep flex justify-center overflow-hidden py-2">
        <div className="h-[220px] w-[220px] lg:h-[260px] lg:w-[260px]">
          <JarvisCore state={state} quality={settings.graphicsQuality} className="h-full w-full" />
        </div>
      </HudPanel>

      <Modal
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        title="RESET ALL SETTINGS"
        footer={
          <>
            <button
              type="button"
              onClick={() => setResetOpen(false)}
              className="rounded-lg border border-cyan/20 px-4 py-2 text-sm text-text-secondary hover:bg-panel-strong"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleReset}
              className="rounded-lg border border-danger/40 bg-danger/10 px-4 py-2 text-sm text-danger hover:bg-danger/20"
            >
              Reset
            </button>
          </>
        }
      >
        This restores every preference — appearance, voice, AI behavior, security, and notifications — to
        its default value ({defaultSettings.aiName} defaults). This cannot be undone.
      </Modal>
    </div>
  );
}
