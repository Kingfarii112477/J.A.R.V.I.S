# J.A.R.V.I.S. — AI Operating System

**Just A Rather Very Intelligent System** — a futuristic AI command center
built with Next.js, React Three Fiber, and Framer Motion. A cinematic boot
sequence, a real 3D holographic core, live simulated telemetry, a working
chat and voice interface, an animated tactical radar, a memory subsystem,
and a settings panel — all wired to one shared state machine so the app
feels like a single system rather than nine disconnected screens.

Runs fully offline in **demo mode** with zero configuration — no API keys
required.

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The app redirects to
`/dashboard` after boot; direct-load any route and it will boot first.

Other scripts:

```bash
npm run build   # production build
npm run start   # run the production build
npm run lint    # eslint
npm run test    # vitest (unit tests)
```

## Screens

| Route          | Screen             |
| -------------- | ------------------ |
| `/dashboard`   | Command center overview, live metrics, quick actions |
| `/chat`        | AI conversation with streaming responses |
| `/voice`       | Voice Command Center — real-time speech in/out, live language detection, waveform, confirmation flow |
| `/systems`     | Subsystem health + power/protocol matrix |
| `/diagnostics` | Diagnostic score, live metrics, interactive terminal |
| `/radar`       | Animated tactical radar (canvas-based) |
| `/memory`      | Holographic memory core + local persistence |
| `/settings`    | General/Appearance/Voice/AI/Security/Notifications/Advanced |

## Architecture

```
src/
  app/            Next.js App Router routes + API routes (/api/chat, /api/n8n, /api/health)
  components/
    3d/           React Three Fiber scene pieces (JarvisCore, EnergyRings, ParticleField, MemoryBrain, ...)
    layout/       Shell, boot gate, lock screen, error boundary fallback
    navigation/   TopBar, SideNav, BottomNav, nav drawer
    hud/          Reusable glass-panel UI primitives (cards, gauges, sparklines)
    dashboard/ chat/ voice/ systems/ diagnostics/ radar/ memory/ settings/
  hooks/          useJarvisState, useTelemetry, useVoice, useAI, useMessagePipeline, ...
  lib/
    ai/           Provider-agnostic AI abstraction (OpenRouter/Groq/OpenAI-compatible/n8n/demo)
    reasoning/    Multi-step LLM tool-calling engine shared by chat/voice/terminal (see below)
    orchestration/ Autonomous multi-step missions (planner, agent registry, approval manager)
    voice/
      stt/        Speech-to-text provider abstraction (AssemblyAI, browser fallback)
      tts/        Text-to-speech provider abstraction (Azure AI Speech, OpenAI, ElevenLabs, browser fallback)
      language/   Multilingual detection (English/Urdu/Hindi/Roman Urdu/Hinglish) + response-language policy
      speechFormatter.ts  Speech-safe text rendering (numbers/punctuation), separate from chat display text
      state.ts    VoiceState — a derived view of the shared JarvisState, not a second state machine
    commands/     Unified command dispatcher shared by chat, voice, terminal, and buttons
    telemetry/    Smoothed (lerp-based) simulated metrics engine
    diagnostics/  Shared diagnostics-run sequence
    radar/        Radar target spawn/drift simulation
    memory/       Local (localStorage) memory persistence — explicitly labeled as simulation
  store/          Zustand store — the single J.A.R.V.I.S state machine
  types/ config/  Shared types and design tokens
```

## The state machine

Everything hangs off one `JarvisState` in `store/jarvisStore.ts`:
`BOOTING | IDLE | LISTENING | THINKING | SPEAKING | PROCESSING | DIAGNOSTICS | WARNING | ERROR | OFFLINE`.
The 3D core's color/speed, the status pill, chat's typing state, and voice's
UI all read from this one value, so triggering diagnostics from the
terminal visibly changes the core's animation and the status indicator
everywhere at once.

## Command dispatcher

`lib/commands/dispatcher.ts` is the single place that recognizes system
commands (`run diagnostics`, `system status`, `security check`, `open
<screen>`, etc.) — used identically by the chat input, the voice
transcript, the diagnostic terminal, and quick-action buttons. Unrecognized
input falls through to the AI provider (chat/voice) or a "command not
found" message (terminal).

## AI provider abstraction

`lib/ai/index.ts` picks a backend from server-only environment variables,
in order: OpenRouter → Groq → any OpenAI-compatible endpoint → n8n webhook
→ demo mode. All variants stream through the same
`AsyncGenerator<string>` interface, so `/api/chat` and the client's
`useAI` hook don't need to know which one is active. **No API key is ever
sent to the browser** — see `.env.example`.

## Demo mode

With no provider configured, chat responds from a small set of
context-aware scripted replies, telemetry/diagnostics/radar are locally
simulated, and voice uses the browser's built-in speech APIs. A small
`DEMO` badge appears next to the status indicator whenever a screen is
running without a live AI backend, and the memory screen is explicit that
its numbers come from `localStorage`, not a real vector database.

## Voice & multilingual intelligence

J.A.R.V.I.S. is a genuine voice interface, not a chatbot with a microphone
bolted on — voice is another sensory layer into the *same* reasoning
engine, memory system, tool executor, and event bus that chat and the
terminal already share. There is no separate "voice brain."

```
MIC → capture → STT (AssemblyAI / browser) → language detection
    → ReasoningEngine (tools, memory, missions — identical to chat)
    → speech-safe formatting → TTS (Azure / OpenAI / ElevenLabs / browser)
    → playback, with the 3D core reacting to real audio amplitude
```

**Speech-to-text** (`lib/voice/stt/`): AssemblyAI is the primary production
provider (`ASSEMBLYAI_API_KEY`); the browser's built-in `SpeechRecognition`
is the zero-config fallback and is what runs with no configuration at all.
If a configured server provider isn't actually set up, the app falls back
to the browser recognizer automatically, once, with a visible toast — never
a silent swap.

**Text-to-speech** (`lib/voice/tts/`): Azure AI Speech is the primary
production provider (`AZURE_SPEECH_KEY` / `AZURE_SPEECH_REGION`), selecting
a language-appropriate neural voice per turn (see
`lib/voice/tts/voiceProfiles.ts`). OpenAI TTS and ElevenLabs are also
supported; the browser's `SpeechSynthesis` API is the always-available
fallback. Same fallback philosophy as STT: real → configured fallback →
browser → never a silent failure.

**Supported languages**: English, Urdu (Arabic script), Hindi (Devanagari
script), Roman Urdu (Urdu written in Latin letters), and Hinglish (natural
Hindi/Urdu-English code-switching) — detected automatically per turn by a
dependency-free heuristic classifier (`lib/voice/language/detect.ts`), with
AssemblyAI's own per-utterance language code as one additional real signal.
J.A.R.V.I.S. replies in the same language and style the user used by
default (Settings → Voice & Language → Preferred Language can override
this) — Roman Urdu is never auto-translated into formal script Urdu, since
naturalness matters more than literal translation.

**Voice settings** (Settings → Voice & Language): voice enabled/auto-speak,
interrupt (barge-in), voice confirmations, activation mode, auto language
detection, preferred language, auto-submit speech, silence timeout, STT/TTS
provider with a live CONNECTED / FALLBACK / UNAVAILABLE status badge for
each, voice rate/pitch/volume.

**Browser & permissions**: voice input needs a browser that supports
`SpeechRecognition`/`getUserMedia` (Chrome, Edge, Safari) — the app detects
and reports this rather than failing silently. The microphone never
activates without an explicit tap (push-to-talk/click-to-talk); there is no
always-listening mode. Microphone permission state (granted/denied/not
requested) is shown on the Voice screen with a clear explanation for each.

**Deployment**: `ASSEMBLYAI_API_KEY` / `AZURE_SPEECH_KEY` /
`AZURE_SPEECH_REGION` are server-only — reachable exclusively through
`/api/voice/speak`, `/api/voice/transcribe`, and `/api/voice/status`, never
sent to the browser under any `NEXT_PUBLIC_` variant, and never present in
any response body (only in the outbound request headers to the upstream
provider — see the route test suites under `src/app/api/voice/*` for this
checked explicitly, not just assumed). `NEXT_PUBLIC_VOICE_STT_PROVIDER` /
`NEXT_PUBLIC_VOICE_TTS_PROVIDER` are the one intentional exception — they
carry only a provider *name*, never a secret, and set the factory-default
provider a fresh session starts with (still just a default; Settings →
Voice & Language always overrides it, and both still fall back
automatically if their key turns out to be missing). All three voice
routes share the app's existing per-client rate limiter.

## Notes on scope

- **Memory**: Phase 1 uses `localStorage` only, deliberately kept separate
  from any future backend — see `lib/memory/local.ts`'s doc comment.
- **Agents & missions**: `lib/orchestration/` runs real autonomous
  multi-step missions (planner → task graph → specialist agents → approval
  manager), reachable from chat, voice, or the terminal, and visible on
  `/missions` — not a placeholder. `open research mode` on its own still
  reports an honest CONNECTED / NOT CONNECTED status for the underlying
  research provider rather than faking results either way.
- React Compiler is not enabled in this project; two of
  `eslint-plugin-react-hooks`'s forward-compatibility rules
  (`purity`, `set-state-in-effect`) are turned off in `eslint.config.mjs`
  with an explanation, since they flag standard, safe patterns (one-time
  randomized Three.js geometry, client-only browser-API detection) that
  have no better alternative without the compiler. Everything else in that
  ruleset (including `refs` and `immutability`) is enforced and clean.
