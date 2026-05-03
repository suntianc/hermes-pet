# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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

# Test HTTP API (app must be running)
curl -X POST http://localhost:18765/event \
  -H "Content-Type: application/json" \
  -d '{"type":"thinking"}'
curl http://localhost:18765/actions   # List available model actions
```

## Architecture Overview

**Two-process Electron app** (Electron 41, sandboxed renderer via Vite):

### 1. Main Process (`apps/desktop/electron/`)
- `main.ts` — Entry: single-instance lock, protocol registration, creates window + tray + IPC + event bridge
- `window.ts` — Frameless, transparent, always-on-top BrowserWindow (default 750×700, bottom-right anchored)
- `preload.ts` — contextBridge exposing `window.electronAPI` (petWindow, petModel, onPetAction)
- `ipc.ts` — IPC handlers (drag, resize, passthrough, model management)
- `tray.ts` — System tray with Show/Hide, Always on Top, Mouse Passthrough, Size, Mouse Follow, Switch Model, Import Model, Quit
- `event-bridge.ts` — HTTP server on `:18765`, accepts `POST /event` and `GET /actions`
- `model-manager.ts` — Custom `vivipet-assets://` protocol, model import (.zip / file dialog), bundled model indexing
- `action-index.ts` — Scans model3.json to auto-index motion groups and expression files, mapping them to action names
- `app-state.ts` — Shared `isQuitting` flag for close-to-tray coordination

### 2. React Renderer (`apps/desktop/src/`)
- `main.tsx` — Bootstrap: dynamically loads Live2D Core WASM → renders `<App />`
- `App.tsx` — Root component: loads model configs (built-in + user models), handles IPC events from tray/event-bridge, dispatches actions
- `components/PetStage.tsx` — Canvas container, manages Live2DRenderer lifecycle, mouse tracking, drag, click/double-click
- `components/SpeechBubble.tsx` — Inline text bubble displayed above the pet
- `stores/pet-store.ts` — PetStore singleton + `usePetStore()` hook (currentAction, actionRevision, bubble state)
- `features/pet/model-registry.ts` — Model config types, `loadModelConfigs()` (merges built-in models.json + user models via IPC)

### 3. Live2D Rendering (`src/features/pet/`)
- Cubism 5 SDK vendored at `src/vendor/cubism/` (aliased as `@framework`)
- Cubism Core WASM loaded dynamically in `main.tsx` via injected `<script>`
- WebGL shaders served from `public/Framework/Shaders/WebGL/`
- `PetRenderer.ts` — Renderer abstraction interface (loadModel, playAction, lookAt, resize, resetPointer, etc.)
- `Live2DRenderer.ts` — Cubism 5 implementation: loads `.moc3`, textures, physics, motions; WebGL render loop via `requestAnimationFrame`
- **Action resolution chain**: manual override (ModelConfig.actions) → auto-detect motion group by capitalized name → Idle fallback. Every action starts with `forceResetPose()` to clear angle parameters.

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

## Event Pipeline
```
External trigger (curl POST /event / tray menu / click)
  → event-bridge.ts / tray sendAction() / PetStage click handler
  → pet:action IPC → App.tsx onPetAction listener
  → handleMenuAction() or handleExternalEvent() or direct setAction()
  → petStore.setAction(type) → actionRevision++
  → PetStage useEffect → Live2DRenderer.playAction()
  → forceResetPose() → playMotion() → scheduleIdle(5000)
```

## Important Files

| File | Why it matters |
|------|---------------|
| `electron/main.ts` | Full startup sequence, protocol init |
| `electron/preload.ts` | API surface between main ↔ renderer (petWindow, petModel, onPetAction) |
| `electron/event-bridge.ts` | External agent HTTP API (:18765, /event and /actions) |
| `electron/action-index.ts` | Model action indexing from model3.json |
| `electron/model-manager.ts` | Model import, vivipet-assets protocol, bundled model indexing |
| `electron/tray.ts` | Tray menu with dynamic model list, size, mouse follow, import |
| `src/App.tsx` | Event routing (IPC → action/dispatch), model loading |
| `src/components/PetStage.tsx` | Canvas, mouse events, renderer lifecycle, eye tracking |
| `src/features/pet/Live2DRenderer.ts` | Cubism 5 WebGL engine, auto-detect motions, forceResetPose |
| `src/features/pet/model-registry.ts` | Model config types, merging built-in + user models |
| `src/stores/pet-store.ts` | State management (currentAction, actionRevision, bubble) |
| `public/assets/models/models.json` | Production model registry |
| `vite.config.mts` | Build config, aliases, publicDir |
| `electron-builder.yml` | Packaging config (macOS dmg/zip, Windows nsis) |
| `docs/live2d-model-integration-spec.md` | Model integration convention for creators |
