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
| `/voice`       | Voice command interface (Web Speech API) |
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
    voice/        STT/TTS provider interfaces (browser Web Speech API today)
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

## Notes on scope

- **Memory**: Phase 1 uses `localStorage` only, deliberately kept separate
  from any future backend — see `lib/memory/local.ts`'s doc comment.
- **Voice**: `lib/voice/stt.ts` / `lib/voice/tts.ts` define
  provider-agnostic interfaces; only the zero-config browser implementation
  is wired up today, but a server-proxied Whisper/ElevenLabs-style adapter
  can implement the same contract without touching the Voice screen.
- **Agents**: `deploy agents` / `open research mode` commands return honest
  "not yet connected" responses rather than pretending to run real
  autonomous agents — they're placeholders for future n8n workflows.
- React Compiler is not enabled in this project; two of
  `eslint-plugin-react-hooks`'s forward-compatibility rules
  (`purity`, `set-state-in-effect`) are turned off in `eslint.config.mjs`
  with an explanation, since they flag standard, safe patterns (one-time
  randomized Three.js geometry, client-only browser-API detection) that
  have no better alternative without the compiler. Everything else in that
  ruleset (including `refs` and `immutability`) is enforced and clean.
