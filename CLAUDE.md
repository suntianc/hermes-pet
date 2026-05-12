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
- `.planning/research/` — Live2D Cubism integration research
- `.planning/research/milestone2/` — Tauri 2 + Rust migration research

**Workflow:** `/gsd-plan-phase N` → `/gsd-discuss-phase N` → `/gsd-execute-phase N` → `/gsd-verify-work`
**Tracking:** `/gsd-progress` or `/gsd-stats`

## Monorepo Structure

**Yarn 1 workspaces + Turborepo** monorepo with 3 packages:

```
hermes-pet/
├── apps/desktop/              ← Tauri 2 desktop app (Rust + React + Live2D Cubism 5)
│   └── src-tauri/             ← Rust backend (Tauri 2 commands, state, plugins)
│       ├── src/               ← Rust source: TTS, Adapter, Model, AI Planner, Commands
│       ├── Cargo.toml         ← Rust dependencies
│       └── tauri.conf.json    ← Tauri configuration (window, tray, updater, etc.)
├── packages/pet-action-dsl/   ← @hermes/pet-action-dsl (types-only DSL for composable actions)
├── packages/shared/           ← @hermes/shared (PetActionType, Position, Size, WindowState, PetConfig)
├── turbo.json                 ← Build pipeline: build depends on ^build
└── package.json               ← Root: yarn workspaces, delegates to desktop
```

Workspace packages must be built before the desktop app (Turbo handles this via `dependsOn: ["^build"]`).

## Commands

```bash
# Development (Tauri dev server with hot-reload)
cd apps/desktop && npm run dev

# Build (includes Rust compilation + Vite bundle)
cd apps/desktop && npm run build

# Build only the Vite frontend
cd apps/desktop && npx vite build

# Build shared packages (needed before desktop if changed)
cd packages/shared && npm run build
cd packages/pet-action-dsl && npm run build

# Turbo commands (from root)
yarn lint              # turbo run lint
yarn clean             # turbo run clean

# Rust commands (from apps/desktop/src-tauri/)
cd apps/desktop/src-tauri && cargo check
cd apps/desktop/src-tauri && cargo build
cd apps/desktop/src-tauri && cargo test

# Integration smoke test (app must be running)
bash test-vivipet-agent-flow.sh

# Test Adapter API manually (app must be running)
curl -X POST http://localhost:18765/adapter \
  -H "Content-Type: application/json" \
  -d '{"agent":"manual","phase":"thinking"}'
curl http://localhost:18765/adapter/capabilities
```

## Architecture Overview

**Tauri 2 desktop app** (Rust + React + Live2D Cubism 5 WebGL). GitHub: `suntianc/ViviPet`.

### 1. Rust Backend (`apps/desktop/src-tauri/src/`)
- **`main.rs`** — Entry point: Tauri builder, plugin registration, command registration
- **`lib.rs`** — Module declarations and shared state initialization
- **`window.rs`** — Window management (frameless, transparent, always-on-top, bottom-right anchored)
- **`tray.rs`** — System tray with Show/Hide, Always on Top, Mouse Passthrough, Size, Mouse Follow, TTS toggle, Switch Model, Import Model, Quit
- **`tts/`** — Full TTS module:
  - `manager.rs` — Queue-based TTS engine, text splitting (500 chars/chunk), provider dispatch
  - `config.rs` — Config persisted via tauri-plugin-store, three provider types (system/local/cloud), three request modes (preset/clone/instruct)
  - `providers/system.rs` — macOS `say` command / Windows SAPI / Linux espeak-ng
  - `providers/local.rs` — HTTP streaming to local TTS service
  - `providers/cloud.rs` — OpenAI / ElevenLabs / Azure / custom API streaming
- **`adapter.rs`** — Embedded axum HTTP server on port 18765 with graceful shutdown
- **`model.rs`** — 模型文件导入（.moc3 / .model3.json）、目录扫描、模型注册表
- **`ai_planner.rs`** — OpenAI client with function calling (rule/ai/hybrid modes)
- **`commands.rs`** — Tauri commands exposed to frontend via `@tauri-apps/api`

### 2. React Renderer (`apps/desktop/src/`)
- **`tauri-adapter.ts`** — Abstraction layer wrapping `@tauri-apps/api` invoke/events, mirrors old `window.electronAPI` interface
- `main.tsx` — Bootstrap: dynamically loads Live2D Cubism Core WASM → renders `<App />`
- `App.tsx` — Root component: model loading, IPC routing, TTS vs bubble decision, applies Adapter pet events
- `components/PetStage.tsx` — Canvas container, PetRenderer lifecycle, mouse tracking/drag/click, lip sync mouth animation via isSpeaking + ttsAmplitude
- `components/SpeechBubble.tsx` — Inline text bubble above pet, supports `timed` and `tts-sync` modes
- **`audio/streaming-player.ts`** — Web Audio API player, accumulates audio chunks from Tauri Channel → decodes → plays, real-time RMS amplitude analysis for lip sync
- `stores/pet-store.ts` — PetStore singleton + `usePetStore()` hook (currentAction, actionRevision, bubble state, isSpeaking, ttsState, ttsAmplitude, speechText)
- `features/pet-events/` — Renderer-side Adapter event schema, behavior planner, session manager
- `features/pet/model-registry.ts` — Model config types, `loadModelConfigs()` (merges built-in models.json + user models via IPC)

### 3. Live2D Rendering (`src/features/pet/`)
- **Live2D Cubism 5 WebGL SDK** — Core rendering engine, dynamically loaded via `live2dcubismcore.min.js`
- Cubism WASM loaded dynamically in `main.tsx`
- `PetRenderer.ts` — Renderer abstraction interface (loadModel, playAction, setSpeaking, lookAt, resize, etc.)
- `Live2DRenderer.ts` — Live2D implementation: loads `.moc3` models, manages CubismUserModel, WebGL render loop, motion playback
- `live2d-action-map.ts` — Action name → Live2D Motion group mapping, Idle fallback chain

**Motion resolution chain**: Manual override (ModelConfig.actions) → ACTION_MOTION_MAP preset → capitalize match → raw name match → Idle fallback. Every action resolves through `resolveAction()` with `clearIdleTimer()` to prevent cancellation conflicts.

**Key Live2D parameters** (Cubism model Params, set per-frame in startLoop):
| Parameter | Source | Purpose |
|-----------|--------|---------|
| ParamMouthOpenY | RMS amplitude (smoothed) | Lip sync |
| ParamAngleX / ParamAngleY | Mouse position (lerp) | Eye tracking / head follow |
| CubismBreath | Built-in framework | Breathing animation |
| CubismEyeBlink | Built-in framework | Automatic eye blinking |

**Renderer abstraction**: `PetRenderer` interface with `Live2DRenderer` implementation; `PetRendererType` also defines `spine`, `gif`, `vrm` for future renderer swaps.

## IPC Model (Tauri Commands + Events)

```
Frontend (React/TypeScript)            Rust Backend
─────────────────────────              ────────────
@tauri-apps/api/core → invoke()  →  #[tauri::command] fn my_command()
@tauri-apps/api/event → listen() ←  app_handle.emit("event-name", payload)
@tauri-apps/api/core → Channel     →  Channel send() for streaming (audio chunks)
```

All IPC goes through `src/tauri-adapter.ts` which provides typed wrappers:
- `tauriAdapter.invoke(command, args)` — Tauri command invocation
- `tauriAdapter.listen(event, callback)` — Event listener registration
- `tauriAdapter.getChannel()` — Creates a Tauri Channel for streaming

## Event Pipeline

```
External agent hook (curl POST /adapter)
  → Rust axum server (:18765)
  → normalize + validate event
  → tauri::Emitter::emit("pet:event", payload)
  → App.tsx listener (via @tauri-apps/api/event)
  → applyPetStateEvent(event)             ← animation state
  → if event.text/message → handleSpeech(text)
  → petStore.setAction(type) → actionRevision++
  → PetStage useEffect → Live2DRenderer.playAction()
  → forceResetPose() → set SM state input → scheduleIdle()

TTS flow:
  → handleSpeech checks event.tts and current TTS config
  → tts enabled → invoke("tts_speak", { text, options })
  → Rust TTS manager queues → provider streams → Channel send audio chunks
  → frontend Channel listener → StreamingAudioPlayer → Web Audio API playback
  → real-time RMS → PetStore → Live2DRenderer mouth animation (ParamMouthOpenY)
  → tts disabled / error → SpeechBubble fallback
```

## Model System

### Directory Structure
```
apps/desktop/public/
├── assets/models/models.json ← Model registry (runtime JSON)
└── models/<ModelName>/       ← Built-in models (.moc3 files)
```

### Loading (dual-tier)
1. **Primary**: `public/assets/models/models.json` at runtime via `fetch()`
2. **Fallback**: `FALLBACK_MODELS` in `model-registry.ts`
3. **User models**: Merged via `invoke("model_list")` from `userData/models/`

### Action Resolution
```
playAction("thinking")
  → ModelConfig.actions?.thinking (manual override, models.json)
  → resolveAction: match "thinking" state → set Live2D Motion group
  → fallback: "idle" motion
  → forceResetPose() before every action
```

### Adapter Phases and Internal Actions
Adapter phases: `idle`, `thinking`, `speaking`, `tool:start`, `tool:success`, `tool:error`, `task:done`, `session:start`, `session:update`, `session:end`, `message`

Internal actions: `idle`, `thinking`, `speaking`, `happy`, `success`, `error`, `confused`, `angry`, `searching`, `reading`, `coding`, `terminal`, `sleep`, `wake`

## TTS System

### Three Providers
| Source | Type | Dependencies |
|--------|------|-------------|
| `system` | macOS `say` command / Windows SAPI / Linux espeak-ng | Zero dependencies |
| `local` | HTTP streaming to self-hosted TTS | Running service |
| `cloud` | OpenAI / ElevenLabs / Azure API | API key + network |

### Three Request Modes
| Mode | HTTP Body | Use Case |
|------|-----------|----------|
| `preset` | `{Text, Voice, Model}` | Predefined voice |
| `clone` | `{Text, Model}` | Voice cloning (reference audio pre-configured) |
| `instruct` | `{Text, Instruct, Model}` | Style instruction |

## CI/CD

- **`ci.yml`** — Push/PR to main: install → build shared packages → build desktop → upload artifacts (macOS, Node 20)
- **`release.yml`** — On `v*` tags: matrix build (mac-arm64, mac-x64, linux, windows) → `cargo tauri build` → draft GitHub Release

## Important Files

| File | Why it matters |
|------|---------------|
| `apps/desktop/src-tauri/src/main.rs` | Tauri 2 app entry — plugin registration, window/tray init |
| `apps/desktop/src-tauri/src/lib.rs` | Module structure, shared state |
| `apps/desktop/src-tauri/src/commands.rs` | All Tauri commands exposed to frontend |
| `apps/desktop/src-tauri/src/tts/` | Rust TTS engine: manager, config, 3 providers |
| `apps/desktop/src-tauri/src/adapter.rs` | Embedded axum HTTP server (:18765) |
| `apps/desktop/src-tauri/src/model.rs` | .moc3 / .model3.json 文件导入、目录扫描、模型注册表 |
| `apps/desktop/src-tauri/src/ai_planner.rs` | OpenAI function calling, rule/ai/hybrid modes |
| `apps/desktop/src-tauri/src/tray.rs` | System tray with dynamic model list |
| `apps/desktop/src-tauri/src/window.rs` | Frameless, transparent, always-on-top window |
| `apps/desktop/src-tauri/tauri.conf.json` | App config: window, tray, updater, plugins, bundle |
| `apps/desktop/src/tauri-adapter.ts` | Frontend IPC abstraction layer |
| `apps/desktop/src/App.tsx` | Event routing, TTS vs bubble decision, Adapter event application |
| `apps/desktop/src/audio/streaming-player.ts` | Web Audio API player with real-time amplitude analysis |
| `apps/desktop/src/components/PetStage.tsx` | Canvas, mouse events, renderer lifecycle, eye tracking, lip sync |
| `apps/desktop/src/components/SpeechBubble.tsx` | Speech bubble with timed/tts-sync modes |
| `apps/desktop/src/stores/pet-store.ts` | State management (actions, bubbles, TTS state, lip sync amplitude) |
| `apps/desktop/src/features/pet/Live2DRenderer.ts` | Live2D engine: loads .moc3, CubismUserModel, WebGL render loop, motion playback |
| `apps/desktop/src/features/pet/live2d-action-map.ts` | Live2D action-to-motion mapping and resolveAction function |
| `apps/desktop/src/features/pet/PetRenderer.ts` | Renderer abstraction interface |
| `apps/desktop/src/features/pet/model-registry.ts` | Model config types, merging built-in + user models |
| `apps/desktop/vite.config.mts` | Build config, aliases (`@`, `@pet-action-dsl`, `@shared`), publicDir |
| `apps/desktop/src-tauri/Cargo.toml` | Rust dependencies |
| `packages/pet-action-dsl/` | Types-only DSL for composable pet actions (motion, expression, bubble, speak, moveTo, etc.) |
| `packages/shared/` | Shared types: PetActionType (20 types), Position, Size, WindowState, PetConfig |
