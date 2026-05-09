# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## GSD Workflow

This project uses Get Shit Done (GSD) workflow for structured planning and execution.

**Planning artifacts are in `.planning/`:**
- `.planning/PROJECT.md` — Project context and goals
- `.planning/config.json` — Workflow preferences
- `.planning/REQUIREMENTS.md` — v1/v2 requirements with REQ-IDs (Milestone 2: 25 reqs)
- `.planning/ROADMAP.md` — Execution plan (Milestone 2: 8 phases)
- `.planning/STATE.md` — Current project state
- `.planning/codebase/` — Codebase analysis (7 documents)
- `.planning/research/` — Rive integration research
- `.planning/research/milestone2/` — Tauri 2 + Rust migration research

**Workflow:** `/gsd-plan-phase N` → `/gsd-discuss-phase N` → `/gsd-execute-phase N` → `/gsd-verify-work`
**Tracking:** `/gsd-progress` or `/gsd-stats`

## Monorepo Structure

**Yarn 1 workspaces + Turborepo** monorepo with 3 packages:

```
hermes-pet/
├── apps/desktop/          ← Electron app (vivi-pet)
├── packages/pet-action-dsl/  ← @hermes/pet-action-dsl (types-only DSL for composable actions)
├── packages/shared/          ← @hermes/shared (PetActionType, Position, Size, WindowState, PetConfig)
├── turbo.json               ← Build pipeline: build depends on ^build
└── package.json             ← Root: yarn workspaces, delegates to desktop
```

Workspace packages must be built before the desktop app (Turbo handles this via `dependsOn: ["^build"]`).

## Commands

```bash
# Development (renderer + main process watch, from apps/desktop/)
cd apps/desktop && npm run dev

# Or individual processes
npm run dev:renderer   # Vite dev server on :5173
npm run dev:main       # tsc --watch for electron/ → dist/main/

# Build (from apps/desktop/)
npm run build          # main process + renderer
npm run build:main     # tsc electron/ → dist/main/
npm run build:renderer # vite build → dist/renderer/

# Build shared packages (needed before desktop if changed)
cd packages/shared && npm run build
cd packages/pet-action-dsl && npm run build

# Turbo commands (from root)
yarn lint              # turbo run lint
yarn clean             # turbo run clean

# Run (after build)
npm start              # electron .

# Package for distribution (from apps/desktop/)
npm run package        # npm run build && electron-builder --mac --publish never
npm run package:win    # npm run build && electron-builder --win --publish never
npm run package:all    # npm run build && electron-builder --mac --win --publish never

# Integration smoke test (app must be running)
bash test-vivipet-agent-flow.sh

# Test Adapter API manually (app must be running)
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
- `model-manager.ts` — Custom `vivipet-assets://` protocol, model import (.riv / .zip / file dialog), bundled model indexing
- `ai-planner.ts` — AI behavior planner using OpenAI function calling (rule/ai/hybrid modes)
- `action-index.ts` — Scans model files to auto-index motion groups and expression files
- `app-state.ts` — Shared `isQuitting` flag for close-to-tray coordination
- **`tts/`** — Full TTS module:
  - `tts-manager.ts` — Queue-based TTS engine, text splitting (500 chars/chunk), provider dispatch
  - `tts-config.ts` — Config persisted at `{userData}/tts-config.json`, three provider types (system/local/cloud), three request modes (preset/clone/instruct)
  - `text-utils.ts` — Long text segmentation by sentence → comma → hard split
  - `streamers/system-streamer.ts` — macOS `say` command (zero dependencies), edge-tts CLI
  - `streamers/local-streamer.ts` — HTTP streaming to local TTS service, unified field mapping (Text/Voice/Model/Instruct)
  - `streamers/cloud-streamer.ts` — OpenAI / ElevenLabs / Azure / custom API streaming

### 2. React Renderer (`apps/desktop/src/`)
- `main.tsx` — Bootstrap: dynamically loads Rive WASM → renders `<App />`
- `App.tsx` — Root component: model loading, IPC routing, **TTS vs bubble decision (mutually exclusive)**, applies Adapter pet events
- `components/PetStage.tsx` — Canvas container, PetRenderer lifecycle, mouse tracking/drag/click, **lip sync mouth animation via isSpeaking + ttsAmplitude**
- `components/SpeechBubble.tsx` — Inline text bubble above pet, supports `timed` and `tts-sync` modes
- **`audio/streaming-player.ts`** — Web Audio API player, accumulates audio chunks → decodes → plays, real-time RMS amplitude analysis for lip sync
- `stores/pet-store.ts` — PetStore singleton + `usePetStore()` hook (currentAction, actionRevision, bubble state, **isSpeaking, ttsState, ttsAmplitude, speechText**)
- `features/pet-events/` — Renderer-side Adapter event schema, behavior planner, session manager
- `features/pet/model-registry.ts` — Model config types, `loadModelConfigs()` (merges built-in models.json + user models via IPC)

### 3. Rive Rendering (`src/features/pet/`)
- `@rive-app/canvas` (npm package, v2.37+) — Rive renderer engine
- Rive WASM loaded dynamically in `main.tsx`
- `PetRenderer.ts` — Renderer abstraction interface (loadModel, playAction, setSpeaking, lookAt, resize, etc.)
- `RiveRenderer.ts` — Rive implementation: loads `.riv` files, manages state machine inputs, WebGL render loop
- `rive-inputs.ts` — State machine input constants and state value definitions

**Rive State Machine Inputs** (defined in `rive-inputs.ts`):
| Input | Type | Purpose |
|-------|------|---------|
| `state` | Number | Animation state index (0=idle, 1=thinking, 2=speaking, 3=happy, 4=error, 5=searching, 6=coding, 7=terminal, 8=confused, 9=angry) |
| `blink` | Trigger | Eye blink trigger |
| `breathe` | Trigger | Breathing animation trigger |
| `mouth_open` | Number | Lip sync amplitude (0-1) |
| `look_x` | Number | Horizontal eye tracking (-1 to 1) |
| `look_y` | Number | Vertical eye tracking (-1 to 1) |

**Action resolution chain**: Manual override (ModelConfig.actions) → auto-detect state by action name → Idle fallback. Every action starts with `forceResetPose()` to clear parameters.

**Renderer abstraction**: `PetRenderer` interface with `RiveRenderer` implementation; `PetRendererType` also defines `spine`, `gif`, `vrm` for future renderer swaps.

## Model System

### Directory Structure
```
apps/desktop/public/
├── assets/models/models.json ← Model registry (runtime JSON)
└── models/<ModelName>/       ← Built-in models (.riv files)
```

### Loading (dual-tier)
1. **Primary**: `public/assets/models/models.json` at runtime via `fetch()`
2. **Fallback**: `FALLBACK_MODELS` in `model-registry.ts`
3. **User models**: Merged via IPC `petModel.listUserModels()` from `userData/models/`

### Action Resolution
```
playAction("thinking")
  → ModelConfig.actions?.thinking (manual override, models.json)
  → resolveAction: match "thinking" state → set Rive SM state input
  → fallback: "idle" state
  → forceResetPose() before every action
```

### Adapter Phases and Internal Actions
Adapter phases: `idle`, `thinking`, `speaking`, `tool:start`, `tool:success`, `tool:error`, `task:done`, `session:start`, `session:update`, `session:end`, `message`

Internal actions: `idle`, `thinking`, `speaking`, `happy`, `success`, `error`, `confused`, `angry`, `searching`, `reading`, `coding`, `terminal`, `sleep`, `wake`

## Event Pipeline

```
External agent hook (curl POST /adapter)
  → adapter/server.ts
  → normalizeAgentEvent() → toPetStateEvent()
  → pet:event IPC → App.tsx onPetEvent listener
  → applyPetStateEvent(event)             ← animation state
  → if event.text/message → handleSpeech(text) ← per-event `tts` switch + current TTS config; provider failure falls back to bubble
  → petStore.setAction(type) → actionRevision++
  → PetStage useEffect → RiveRenderer.playAction()
  → forceResetPose() → set SM state input → scheduleIdle()

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
  → real-time RMS → PetStore → RiveRenderer mouth animation (mouth_open input)
```

Configuration persisted at `{userData}/tts-config.json`. Configurable via tray menu: Right-click → TTS Settings.

## CI/CD

- **`ci.yml`** — Push/PR to main: install → build shared packages → build desktop → upload artifacts (macOS, Node 20)
- **`release.yml`** — On `v*` tags: matrix build (mac-arm64, mac-x64, linux, windows) → electron-builder → draft GitHub Release

## Important Files

| File | Why it matters |
|------|---------------|
| `apps/desktop/electron/main.ts` | Full startup sequence, protocol init, TTS init |
| `apps/desktop/electron/preload.ts` | API surface between main ↔ renderer (petWindow, petModel, petTTS, onPetAction, onPetEvent) |
| `apps/desktop/electron/ipc.ts` | All IPC handlers including TTS (speak, stop, getConfig, setConfig, getVoices) |
| `apps/desktop/electron/adapter/` | Built-in Agent Adapter (:18765, /adapter and /adapter/capabilities). 4 files: server, protocol, normalize, policy |
| `apps/desktop/electron/ai-planner.ts` | AI behavior planner using OpenAI function calling (rule/ai/hybrid modes) |
| `apps/desktop/electron/tts/tts-manager.ts` | TTS engine core: queue, provider dispatch, text splitting, state broadcast |
| `apps/desktop/electron/tts/tts-config.ts` | Config types, persistence, three request modes |
| `apps/desktop/electron/tray.ts` | Tray menu with dynamic model list, TTS toggle/source, size, mouse follow |
| `apps/desktop/src/App.tsx` | Event routing, TTS vs bubble decision, Adapter event application |
| `apps/desktop/src/audio/streaming-player.ts` | Web Audio API player with real-time amplitude analysis |
| `apps/desktop/src/components/PetStage.tsx` | Canvas, mouse events, renderer lifecycle, eye tracking, lip sync |
| `apps/desktop/src/components/SpeechBubble.tsx` | Speech bubble with timed/tts-sync modes |
| `apps/desktop/src/stores/pet-store.ts` | State management (actions, bubbles, TTS state, lip sync amplitude) |
| `apps/desktop/src/features/pet/RiveRenderer.ts` | Rive engine: loads .riv, SM input management, lip sync, mouse follow, idle return |
| `apps/desktop/src/features/pet/rive-inputs.ts` | Rive state machine input constants and RiveStateValue type |
| `apps/desktop/src/features/pet/PetRenderer.ts` | Renderer abstraction interface (designed for future spine/gif/vrm renderers) |
| `apps/desktop/src/features/pet/model-registry.ts` | Model config types, merging built-in + user models |
| `apps/desktop/vite.config.mts` | Build config, aliases (`@`, `@pet-action-dsl`, `@shared`), publicDir |
| `apps/desktop/electron-builder.yml` | Packaging config (macOS dmg/zip, Windows nsis, Linux AppImage/deb) |
| `packages/pet-action-dsl/` | Types-only DSL for composable pet actions (motion, expression, bubble, speak, moveTo, etc.) |
| `packages/shared/` | Shared types: PetActionType (20 types), Position, Size, WindowState, PetConfig |
