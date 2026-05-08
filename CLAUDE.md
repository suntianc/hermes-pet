# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## GSD Workflow

This project uses Get Shit Done (GSD) workflow for structured planning and execution.

**Planning artifacts are in `.planning/`:**
- `.planning/PROJECT.md` — Project context and goals
- `.planning/config.json` — Workflow preferences
- `.planning/REQUIREMENTS.md` — 24 v1 requirements with REQ-IDs
- `.planning/ROADMAP.md` — 4-phase execution plan
- `.planning/STATE.md` — Current project state
- `.planning/codebase/` — Codebase analysis (7 documents)
- `.planning/research/` — Rive integration research

**Workflow:** `/gsd-plan-phase N` → `/gsd-discuss-phase N` → `/gsd-execute-phase N` → `/gsd-verify-work`
**Tracking:** `/gsd-progress` or `/gsd-stats`

## Commands

```bash
# Development (renderer + main process watch)
cd apps/desktop && npm run dev

# Or individual processes
npm run dev:renderer   # Vite dev server on :5173
npm run dev:main       # tsc --watch for electron/ → dist/main/

# Build
npm run build          # main process + renderer
npm run build:main     # tsc electron/ → dist/main/
npm run build:renderer # vite build → dist/renderer/

# Run (after build)
npm start              # electron .

# Package for distribution (macOS)
npm run package        # npm run build && electron-builder --mac
npm run package:win    # npm run build && electron-builder --win
npm run package:all    # npm run build && electron-builder --mac --win

# One-click build script (with cleanup)
bash scripts/package.sh        # macOS
bash scripts/package.sh win    # Windows
bash scripts/package.sh all    # macOS + Windows

# Test Adapter API (app must be running)
curl -X POST http://localhost:18765/adapter \
  -H "Content-Type: application/json" \
  -d '{"agent":"manual","phase":"thinking"}'
curl http://localhost:18765/adapter/capabilities
```

## Architecture Overview

**Two-process Electron app** (Electron 41, sandboxed renderer via Vite). GitHub: `suntianc/ViviPet`.

### 1. Main Process (`apps/desktop/electron/`)
- `main.ts` — Entry: single-instance lock, protocol registration, creates window + tray + IPC + Adapter + TTS
- `window.ts` — Frameless, transparent, always-on-top BrowserWindow (default 750×700, bottom-right anchored)
- `preload.ts` — contextBridge exposing `window.electronAPI` (petWindow, petModel, **petTTS**, onPetAction, onPetEvent)
- `ipc.ts` — IPC handlers (drag, resize, passthrough, model management, **TTS speak/stop/config/voices**)
- `tray.ts` — System tray with Show/Hide, Always on Top, Mouse Passthrough, Size, Mouse Follow, **TTS toggle + source**, Switch Model, Import Model, Quit
- `adapter/` — HTTP Adapter on `:18765`, accepts `POST /adapter` and `GET /adapter/capabilities`
- `model-manager.ts` — Custom `vivipet-assets://` protocol, model import (.zip / file dialog), bundled model indexing
- `action-index.ts` — Scans model3.json to auto-index motion groups and expression files, mapping them to action names
- `app-state.ts` — Shared `isQuitting` flag for close-to-tray coordination
- **`tts/`** — Full TTS module:
  - `tts-manager.ts` — Queue-based TTS engine, text splitting (500 chars/chunk), provider dispatch
  - `tts-config.ts` — Config persisted at `{userData}/tts-config.json`, three provider types (system/local/cloud), three request modes (preset/clone/instruct)
  - `text-utils.ts` — Long text segmentation by sentence → comma → hard split
  - `streamers/system-streamer.ts` — macOS `say` command (zero dependencies), edge-tts CLI
  - `streamers/local-streamer.ts` — HTTP streaming to local TTS service, unified field mapping (Text/Voice/Model/Instruct)
  - `streamers/cloud-streamer.ts` — OpenAI / ElevenLabs / Azure / custom API streaming

### 2. React Renderer (`apps/desktop/src/`)
- `main.tsx` — Bootstrap: dynamically loads Live2D Core WASM → renders `<App />`
- `App.tsx` — Root component: model loading, IPC routing, **TTS vs bubble decision (mutually exclusive)**, applies Adapter pet events
- `components/PetStage.tsx` — Canvas container, Live2DRenderer lifecycle, mouse tracking/drag/click, **lip sync mouth animation via isSpeaking + ttsAmplitude**
- `components/SpeechBubble.tsx` — Inline text bubble above pet, supports `timed` and `tts-sync` modes
- **`audio/streaming-player.ts`** — Web Audio API player, accumulates audio chunks → decodes → plays, real-time RMS amplitude analysis for lip sync
- `stores/pet-store.ts` — PetStore singleton + `usePetStore()` hook (currentAction, actionRevision, bubble state, **isSpeaking, ttsState, ttsAmplitude, speechText**)
- `features/pet-events/` — Renderer-side Adapter event schema and state application
- `features/pet/model-registry.ts` — Model config types, `loadModelConfigs()` (merges built-in models.json + user models via IPC)

### 3. Live2D Rendering (`src/features/pet/`)
- Cubism 5 SDK vendored at `src/vendor/cubism/` (aliased as `@framework`)
- Cubism Core WASM loaded dynamically in `main.tsx` via injected `<script>`
- WebGL shaders served from `public/Framework/Shaders/WebGL/`
- `PetRenderer.ts` — Renderer abstraction interface (loadModel, playAction, **setSpeaking**, lookAt, resize, etc.)
- `Live2DRenderer.ts` — Cubism 5 implementation: loads `.moc3`, textures, physics, motions; WebGL render loop via `requestAnimationFrame`
- **Action resolution chain**: manual override (ModelConfig.actions) → auto-detect motion group by capitalized name → Idle fallback. Every action starts with `forceResetPose()` to clear angle parameters.
- **Lip sync**: `OfficialCubismModel.setSpeaking(amplitude)` drives `ParamMouthOpenY` in the update loop with sine wave + random factor.

## Model System

### Directory Structure
```
public/
├── models/<ModelName>/       ← Built-in models
│   ├── <Name>.model3.json    ← Motions keyed by capitalized group names (Idle, Thinking, Happy...)
│   ├── <Name>.moc3
│   ├── motion/               ← *.motion3.json files
│   └── expression/           ← *.exp3.json expression files
├── assets/models/models.json ← Model registry (runtime JSON)
├── Framework/Shaders/        ← WebGL shaders
└── live2dcubismcore.js       ← Cubism Core WASM
```

### Loading (dual-tier)
1. **Primary**: `public/assets/models/models.json` at runtime via `fetch()`
2. **Fallback**: `FALLBACK_MODELS` in `model-registry.ts`
3. **User models**: Merged via IPC `petModel.listUserModels()` from `userData/models/`

### Action Resolution
```
playAction("thinking")
  → ModelConfig.actions?.thinking (manual override, models.json)
  → resolveAction: match "Thinking" motion group → play it
  → fallback: "Idle" group
  → forceResetPose() before every action
```

### Adapter Phases and Internal Actions
Adapter phases: `idle`, `thinking`, `speaking`, `tool:start`, `tool:success`, `tool:error`, `task:done`, `session:start`, `session:end`, `message`

Internal actions remain model-specific implementation details: `idle`, `thinking`, `speaking`, `happy`, `success`, `error`, `confused`, `angry`, `searching`, `reading`, `coding`, `terminal`, `sleep`, `wake`

## Event Pipeline

```
External agent hook (curl POST /adapter)
  → adapter/server.ts
  → normalizeAgentEvent() → toPetStateEvent()
  → pet:event IPC → App.tsx onPetEvent listener
  → applyPetStateEvent(event)             ← animation state
  → if event.text/message → handleSpeech(text) ← per-event `tts` switch + current TTS config; provider failure falls back to bubble
  → petStore.setAction(type) → actionRevision++
  → PetStage useEffect → Live2DRenderer.playAction()
  → forceResetPose() → playMotion() → scheduleIdle()

Tray menu / click events still use local `pet:action` handlers.

TTS flow:
  → handleSpeech checks event.tts and current petTTS config
  → tts true + enabled config → petTTS.speak(text, options) → IPC pet:tts:speak
  → tts false / disabled config / provider error → SpeechBubble fallback
  → TTSManager.queue → stream/providers → audio chunks
  → IPC pet:tts:audioChunk → StreamingAudioPlayer → Web Audio API playback
  → IPC pet:tts:state (playing/idle/error) → PetStore → PetStage lip sync
```

## TTS System

### Three Providers
| Source | Type | Dependencies |
|--------|------|-------------|
| `system` | macOS `say` command | Zero dependencies |
| `local` | HTTP streaming to self-hosted TTS | Running service |
| `cloud` | OpenAI / ElevenLabs / Azure API | API key + network |

### Three Request Modes
| Mode | HTTP Body | Use Case |
|------|-----------|----------|
| `preset` | `{Text, Voice, Model}` | Predefined voice |
| `clone` | `{Text, Model}` | Voice cloning (reference audio pre-configured) |
| `instruct` | `{Text, Instruct, Model}` | Style instruction |

### Stream Flow
```
App.tsx handleSpeech()
  → IPC pet:tts:speak (renderer → main)
  → TTSManager.queue (FIFO queue strategy)
  → text splitting (maxChars per chunk, default 500)
  → provider stream (AsyncGenerator<AudioChunk>)
  → IPC pet:tts:audioChunk (Uint8Array chunks, ~16KB each)
  → StreamingAudioPlayer accumulate + decodeAudioData + play
  → real-time RMS → PetStore → Live2DRenderer mouth animation
```

Configuration persisted at `{userData}/tts-config.json`. Configurable via tray menu: Right-click → TTS Settings.

## Important Files

| File | Why it matters |
|------|---------------|
| `electron/main.ts` | Full startup sequence, protocol init, TTS init |
| `electron/preload.ts` | API surface between main ↔ renderer (petWindow, petModel, petTTS, onPetAction, onPetEvent) |
| `electron/ipc.ts` | All IPC handlers including TTS (speak, stop, getConfig, setConfig, getVoices) |
| `electron/adapter/` | Built-in Agent Adapter (:18765, /adapter and /adapter/capabilities) |
| `electron/tts/tts-manager.ts` | TTS engine core: queue, provider dispatch, text splitting, state broadcast |
| `electron/tts/tts-config.ts` | Config types, persistence, three request modes |
| `electron/tray.ts` | Tray menu with dynamic model list, TTS toggle/source, size, mouse follow |
| `src/App.tsx` | Event routing, TTS vs bubble decision, Adapter event application |
| `src/audio/streaming-player.ts` | Web Audio API player with real-time amplitude analysis |
| `src/components/PetStage.tsx` | Canvas, mouse events, renderer lifecycle, eye tracking, lip sync |
| `src/components/SpeechBubble.tsx` | Speech bubble with timed/tts-sync modes |
| `src/stores/pet-store.ts` | State management (actions, bubbles, TTS state, lip sync amplitude) |
| `src/features/pet/Live2DRenderer.ts` | Cubism 5 WebGL engine, auto-detect motions, forceResetPose, lip sync mouth animation |
| `src/features/pet/model-registry.ts` | Model config types, merging built-in + user models |
| `public/assets/models/models.json` | Production model registry |
| `vite.config.mts` | Build config, aliases, publicDir |
| `electron-builder.yml` | Packaging config (macOS dmg/zip, Windows nsis) |
