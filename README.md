# J.A.R.V.I.S. — AI Operating System

**Just A Rather Very Intelligent System** — a futuristic AI command center
built with Next.js, React Three Fiber, and Framer Motion. A cinematic boot
sequence, a real 3D holographic core, live simulated telemetry, a working
chat and voice interface, an animated tactical radar, a memory subsystem,
and a settings panel — all wired to one shared state machine so the app
feels like a single system rather than nine disconnected screens.

Runs fully offline in **demo mode** with zero configuration — no API keys
required. Also ships as a native Android app (see [Android app](#android-app)
below) via Capacitor, reusing this exact UI and reasoning engine.

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
    device/       DeviceCapabilityProvider abstraction (native Android bridge / unavailable) — see "Android app" below
    system/       Live network/app-lifecycle/AI-health signals feeding the honest ONLINE/OFFLINE/DEGRADED status
  store/          Zustand store — the single J.A.R.V.I.S state machine
  types/ config/  Shared types and design tokens
android/          Native Android project (Capacitor) — see "Android app" below
```

## The state machine

Everything hangs off one `JarvisState` in `store/jarvisStore.ts`:
`BOOTING | IDLE | LISTENING | THINKING | SPEAKING | PROCESSING | DIAGNOSTICS | WARNING | ERROR | OFFLINE`.
The 3D core's color/speed, the status pill, chat's typing state, and voice's
UI all read from this one value, so triggering diagnostics from the
terminal visibly changes the core's animation and the status indicator
everywhere at once.

`OFFLINE` is driven by real connectivity, not simulated: `hooks/
useSystemStatus.ts` (mounted once at the app root) tracks live network
status — the Capacitor `Network` plugin natively, `navigator.onLine`/
`online`/`offline` events on the web — and forces `OFFLINE` the instant
connectivity actually drops, restoring whatever state was active the
instant it returns. A separate, additive `SystemStatus` (`lib/system/
status.ts`) further distinguishes `DEGRADED` (demo/simulation-mode AI),
`VOICE_UNAVAILABLE` (mic permission denied), `DEVICE_BRIDGE_UNAVAILABLE`
(the native Android plugin isn't actually responding, checked with a real
probe call — not just "is this a native shell"), and
`AI_PROVIDER_UNAVAILABLE` (the `/api/health` check failed), shown in
TopBar's status badge — the app never displays a fake "online" status.

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

## Android app

The same J.A.R.V.I.S. UI ships as a native Android app via
[Capacitor](https://capacitorjs.com/) (`/android`), giving genuine access to
device capabilities the browser can't reach — app launching, deep links,
media controls, device status, notifications — while every existing screen,
the reasoning engine, tool governance, and the voice pipeline stay exactly
as they are.

**Architecture decision.** The Android shell is a Capacitor `WebView`
pointed at a **deployed HTTPS URL** (`capacitor.config.ts`'s `server.url`,
overridable via the `CAPACITOR_SERVER_URL` env var) rather than a static
export bundled into the APK. This was a deliberate choice over the two
alternatives the project could otherwise have used:

- **A static export bundled into the APK** was ruled out because the app's
  server-side API routes (`/api/chat`, `/api/reasoning`, `/api/voice/*`)
  hold real secrets (`OPENROUTER_API_KEY`, `AZURE_SPEECH_KEY`, ...) that
  cannot run inside a bundled WebView with no server behind it — confirmed
  in the security scan below, the compiled app bundle is not even present
  in the packaged APK/AAB, only a Cordova compatibility shim and a handful
  of static placeholder assets. Everything else loads live over HTTPS, same
  as a browser tab.
- **A Trusted Web Activity (TWA)** was ruled out because it can't host the
  custom native plugins this app needs (`launch_app`, `open_url` with a
  real installed-app-vs-browser distinction, `media_control`,
  `device_status`) — a TWA is essentially a Custom Tab with no bridge to
  write Kotlin plugin code against.
- **React Native** would have meant rewriting the entire UI a second time
  for no architectural benefit here, directly against the master
  requirement not to unnecessarily rewrite the existing app.

**Device Capability Bridge.** `src/lib/device/` mirrors the exact pattern
already used for STT/TTS (`lib/voice/stt/`, `lib/voice/tts/`): one
interface (`DeviceCapabilityProvider`), a `native` implementation backed by
a real Capacitor plugin (`android/app/src/main/java/com/jarvis/aios/
DeviceCapabilityPlugin.kt`), and an `unavailable` implementation for every
non-native context that honestly reports failure instead of faking success.
`src/lib/tools/deviceTools.ts` registers `launch_app`, `is_app_available`,
`open_url`, `media_control`, `device_status`, `send_notification`, and
`youtube_search` through the *same* `toolRegistry`/executor/governance/
audit pipeline every other tool uses — the Android bridge never bypasses
the reasoning engine or permission checks.

**Wake word.** `lib/voice/wakeWord.ts` implements a real, honestly-scoped
foreground keyword spotter — it reuses the same `SpeechRecognition` engine
`lib/voice/stt/browser.ts` already uses, restarted in a loop while the
Voice screen is open and mic permission is already granted. It is **not** a
background/always-listening service (Android's background-execution limits
make that a materially bigger undertaking — a persistent foreground
`Service` with its own ongoing notification) and it never streams
continuous audio to a cloud STT provider just to spot one word. This is
never presented to the user as always-listening, because it isn't.

### Hands-free continuous listening

J.A.R.V.I.S can stay armed and answer without being touched — in the
Android app **and in the browser**:

```
"Hey JARVIS."      → on-device wake word, no audio leaves the device
"Yes, Sir?"        → spoken acknowledgement (interruptible)
"YouTube par naye Urdu rap songs search karo."
"Certainly, Sir."  → the SAME reasoning engine, tools and Azure TTS
"Now only show the newest ones."   ← no wake word needed (follow-up window)
```

**Wake word — openWakeWord.** Real on-device detection using
[openWakeWord](https://github.com/dscripka/openWakeWord)'s pre-trained
**`hey_jarvis`** model. Chosen specifically because it needs **no
account, no API key and no network** — the three ONNX models ship with
the app (~3.7 MB total) and inference is entirely local.

It is a three-stage chain, and every shape below was verified by running
the real model files rather than assumed:

```
16 kHz mono audio
  → 1280-sample frames (80 ms)
  → melspectrogram.onnx     → 5 frames × 32 mel bins
  → (v / 10) + 2            ← openWakeWord's required transform
  → sliding 76-frame window, step 8
      → embedding_model.onnx → 96 dims
  → sliding 16-embedding window
      → hey_jarvis_v0.1.onnx → score
```

Measured on those real models: **~0.9 % of one CPU core** for realtime
audio, and no false triggers on silence, noise or a pure tone (max score
3.4e-5 against a 0.5 threshold). A detection needs ~3.14 s of audio
context (76 + 8×15 = 196 mel frames), so a freshly started detector is
briefly *warming up* rather than broken — the UI says so.

The sliding-window math lives in one place
(`lib/voice/wake/featurePipeline.ts`) with the model calls injected, so
it is unit-tested with no ONNX runtime at all; the Kotlin engine mirrors
the same logic. False-activation protection (threshold + debounce) is a
separate, separately-tested `WakeDetectionGate` — the debounce is not
cosmetic, since one spoken phrase stays inside the classifier's ~3 s
context for dozens of consecutive 80 ms frames and would otherwise fire
every 80 ms.

> **Model licence — read before shipping commercially.** openWakeWord's
> *code* is Apache 2.0, but its **pre-trained models are CC BY-NC-SA 4.0
> (NonCommercial)** because of their training data. That is fine for
> personal and non-commercial use, and it is a genuine restriction on
> paid or commercial distribution. To ship commercially you would need
> to train a permissively-licensed `hey_jarvis` model (openWakeWord
> documents the training pipeline) or use a different engine.

**Where it runs.**

| | Browser | Android app |
|---|---|---|
| Engine | `onnxruntime-web` (WASM) | `onnxruntime-android` |
| Models | served from `/models/wakeword/` | bundled in `assets/wakeword/` |
| Works when backgrounded | **No** — page-lifetime only | Yes, foreground service |
| Requires HTTPS | Yes (`getUserMedia`) | n/a |

The browser path is genuinely real detection, not a stub — but it only
listens while the page is alive, and it is never presented as background
listening. That remains the native service's job.

**Privacy — the whole reason it's built this way.** While in standby,
microphone audio is consumed *only* by the local detector. It is never
buffered to disk, uploaded, sent to AssemblyAI, or sent to the model.
The only thing that escapes the native standby loop is the fact that the
wake phrase was heard. The in-app indicator
(`components/voice/ListeningIndicator.tsx`) deliberately never merges
"the microphone is open" with "audio is leaving this device" — in
standby it says both, truthfully, and `isAudioLeavingDevice("STANDBY")`
is `false` with a test asserting exactly that. Audit entries
(`VOICE_LISTENING`) record *timing only* — `wake_word.detected`,
`active_listening.started/ended`, `voice_command.processed` — never
audio and never transcripts.

**One brain.** `hooks/useContinuousListening.ts` decides *when* to start
capturing and when to hand the microphone back. It does not transcribe,
reason, execute tools, or speak: it calls the same `startListening` /
`speak` a manual mic tap already uses, so a hands-free turn and a tapped
turn run byte-for-byte the same STT → language detection →
ReasoningEngine → ToolRegistry → PermissionManager → AuditLogger → Azure
TTS pipeline. Voice is an input mechanism, never a security boundary —
a spoken "delete all memories" still goes through the same CONFIRM flow,
and a RESTRICTED tool stays blocked.

**Foreground service** (`android/.../listening/`). A `START_STICKY`
foreground microphone service owns the mic, audio focus, battery-aware
suspension, headset/Bluetooth route changes, and recovery independent of
the WebView. On wake it *releases* the mic so the WebView's own
`getUserMedia` can acquire it — Android grants audio input to one
consumer at a time, and this hand-off is what stops the two from
fighting over it. The ongoing notification says plainly that the mic is
in use and offers a one-tap stop; microphone use is never hidden.

Call interruptions are detected through **audio focus** rather than
`READ_PHONE_STATE`, deliberately — it covers calls and other apps taking
audio without requesting a privacy-sensitive permission the app doesn't
otherwise need.

**Honest limitations** (Android platform behaviour, not worked around):

- Android 14+ only allows a microphone foreground service to *start*
  while the app is visible. Enable continuous listening with the app
  open; the service then keeps running. If Android refuses the start,
  the app says so instead of claiming to listen.
- The OS (and aggressive OEM battery managers) may stop the service
  under memory pressure. It is `START_STICKY` and re-arms on
  recreation, and the UI always reflects the service's real state.
- **Voice barge-in during playback is not claimed.** Tapping the mic
  while J.A.R.V.I.S is speaking interrupts it (Phase 5, unchanged), and
  the follow-up window listens with the mic genuinely open. But
  interrupting *by voice alone mid-sentence* needs acoustic echo
  cancellation so the mic doesn't hear the phone's own speaker — that is
  a real additional undertaking and is not implemented, so it is not
  advertised.
- **Not verified on real hardware.** Everything above compiles and is
  unit-tested, and the APK/AAB build cleanly, but this project's
  development environment has no Android device or emulator. Wake-word
  accuracy, service survival across lock/unlock, and true battery draw
  need testing on a real phone before trusting them.

**Local build**

```bash
npm run build                # builds the Next.js app (typechecks as part of the build)
npx cap sync android          # copies web assets + plugin config into /android
cd android
./gradlew assembleDebug       # -> app/build/outputs/apk/debug/app-debug.apk
./gradlew assembleRelease     # -> app-release.apk (unsigned unless signing is configured below)
./gradlew bundleRelease       # -> app/build/outputs/bundle/release/app-release.aab
```

Requires a local Android SDK (`android/local.properties`'s `sdk.dir`,
gitignored) with platform 36 + build-tools 36.0.0, and JDK 21.

**Release signing.** `android/app/build.gradle`'s `signingConfigs.release`
reads `ANDROID_KEYSTORE_PASSWORD` / `ANDROID_KEY_ALIAS` /
`ANDROID_KEY_PASSWORD` / `ANDROID_KEYSTORE_PATH` from environment variables
first, falling back to an optional `android/keystore.properties` (copy
`android/keystore.properties.example`, gitignored, for local testing only)
— **never hardcoded**. With nothing configured, `assembleRelease`/
`bundleRelease` still succeed and simply produce an **unsigned** build,
which is expected for a local checkout; only CI (with real secrets) or a
developer with a real keystore produces an installable, Play-Console-ready
signed release. To generate a keystore and configure CI:

```bash
keytool -genkeypair -v -keystore release.keystore -alias jarvis-release \
  -keyalg RSA -keysize 2048 -validity 10000
base64 -w0 release.keystore > release.keystore.b64   # -w0 not needed on macOS base64
```

Add four **GitHub Actions repository secrets** (Settings → Secrets and
variables → Actions):

| Secret | Value |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | contents of `release.keystore.b64` |
| `ANDROID_KEYSTORE_PASSWORD` | the `-storepass` you used |
| `ANDROID_KEY_ALIAS` | `jarvis-release` (or whatever `-alias` you used) |
| `ANDROID_KEY_PASSWORD` | the `-keypass` you used |

**CI/CD.** `.github/workflows/android-release.yml` runs on push to `main`,
on a version tag (`v1.0.0`, ...), and on `workflow_dispatch` for manual
runs. It lints, typechecks (via `next build`'s own TypeScript check —
running a standalone `tsc --noEmit` *before* `next build` fails on a clean
checkout, since Next.js only writes its ambient route types into
`.next/types/` as part of building), tests, builds the Next.js app, sets up
JDK 21 + Android SDK 36/36.0.0, syncs the Capacitor project, decodes the
keystore secret if present, and runs `assembleRelease` + `bundleRelease`.
It always uploads `JARVIS-release.apk`/`.aab` as workflow artifacts and
writes a clear **SIGNED**/**UNSIGNED** line to the job summary — it never
implies a production-signed release when the secrets aren't configured.
On a version-tag push, both files are also attached to a GitHub Release.

**Versioning.** `android/app/build.gradle`'s `defaultConfig.versionCode`
(currently `100`, an integer Google Play uses to order releases — bump on
every release) and `versionName` (`"1.0.0"`, the human-readable string)
are plain literals, bumped by hand per release — the same convention most
Android projects use; there's no separate properties file to keep in sync.

**Permissions.** `INTERNET`, `ACCESS_NETWORK_STATE`, `ACCESS_WIFI_STATE`,
`RECORD_AUDIO`, `POST_NOTIFICATIONS`, `BLUETOOTH_CONNECT` are requested;
`CAMERA`/`ACCESS_FINE_LOCATION`/`ACCESS_COARSE_LOCATION` are deliberately
commented out in `AndroidManifest.xml` — the app doesn't use either
capability yet, and declaring an unused dangerous permission is exactly the
kind of "unrestricted device access" the project is committed to avoiding.
App-launch/deep-link targets use Android 11+'s `<queries>` package
visibility (kept in sync by hand with `deviceTools.ts`'s `KNOWN_APPS` map)
rather than the broad `QUERY_ALL_PACKAGES` permission, which Google Play
restricts to narrow approved use cases.

**Play Store readiness — honestly.** Application ID (`com.jarvis.aios`),
adaptive + legacy launcher icons at every density, a real signed
AAB pipeline, HTTPS-only network security config, and privacy-conscious
permission scoping are all in place. **Not yet done, and not claimed as
done**: no Play Console listing exists, no privacy policy page is
published, and current Play Store policy (data-safety declarations,
target-API-level deadlines, etc.) hasn't been checked against this build —
verify the current requirements at
[Google Play Console](https://play.google.com/console) before submitting.
Real-device testing (installing the signed APK on actual Android hardware,
the live system mic-permission dialog, app-launch/deep-link intents
actually opening other installed apps) has not been performed in this
project's development environment, which has no Android
device/emulator — this was instead verified at the code and CI level (a
genuine local Gradle build succeeding, unit tests covering the exact
native-plugin contract, and a real GitHub Actions run producing both
artifacts end to end).

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
