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

# Package for distribution
npm run package        # electron-builder --mac
```

## Architecture Overview

**Two-process Electron app** (main process + renderer) with three layers:

### 1. Main Process (`apps/desktop/electron/`)
- `main.ts` — Entry: single-instance lock, creates window + tray + IPC + event bridge
- `window.ts` — Frameless, transparent, always-on-top BrowserWindow (default 520×760, bottom-right)
- `preload.ts` — contextBridge exposing `window.electronAPI` (petWindow, petTray, onPetAction)
- `ipc.ts` — Window management IPC handlers (drag, resize, mouse passthrough, etc.)
- `event-bridge.ts` — HTTP server on :18765, accepts `POST /event` → forwards via `pet:action` IPC
- `tray.ts` — System tray with Show/Hide, Always on Top, Mouse Passthrough, Quit

### 2. React Renderer (`apps/desktop/src/`)
- `main.tsx` — Bootstrap: dynamically loads Live2D Core WASM → renders `<App />`
- `App.tsx` — Root component: loads model configs, dispatches external events to actions, handles mouse interactions
- `PetStage.tsx` — Canvas container, manages Live2DRenderer lifecycle, mouse tracking
- `stores/pet-store.ts` — PetStore class + `usePetStore()` React hook (currentAction, bubbleText, context menu state)

### 3. Live2D Rendering
- Cubism 5 SDK vendored at `src/vendor/cubism/` (aliased as `@framework`)
- Cubism Core WASM loaded dynamically in `main.tsx` via injected `<script>`
- WebGL shaders served from `public/Framework/Shaders/WebGL/`
- `PetRenderer.ts` — interface for future non-Live2D implementations
- `Live2DRenderer.ts` — Cubism 5 implementation: loads `.moc3`, textures, physics, motions; WebGL render loop via `requestAnimationFrame`

## Key Patterns

### Action Pipeline
```
External event (POST /event :18765 / SSE / UI click)
  → App.tsx handleExternalEvent()
  → petStore.setAction(type)
  → PetStage receives currentAction + actionRevision props
  → Live2DRenderer.playAction() → playMotion() + setExpression()
```

### Model Config (dual-tier loading)
1. **Primary**: `public/assets/models/models.json` (fetched at runtime)
2. **Fallback**: `FALLBACK_MODELS` in `model-registry.ts`

### Path Resolution
Uses `window.location.protocol === 'file:'` to switch between `http://` (dev) and `file://` (production) paths.

## Important Files

| File | Why it matters |
|------|---------------|
| `electron/main.ts` | Full startup sequence |
| `electron/preload.ts` | API surface between main ↔ renderer |
| `electron/event-bridge.ts` | External agent HTTP API (:18765) |
| `src/App.tsx` | Event handling, action dispatch, root state |
| `src/components/PetStage.tsx` | Canvas, mouse events, renderer lifecycle |
| `src/features/pet/Live2DRenderer.ts` | Cubism 5 WebGL rendering engine |
| `src/features/pet/PetRenderer.ts` | Renderer abstraction interface |
| `src/features/pet/model-registry.ts` | Model config types + loading |
| `src/features/actions/generated-actions.json` | Declarative action definitions |
| `src/stores/pet-store.ts` | State management |
| `public/assets/models/models.json` | Production model registry |
| `vite.config.mts` | Build config, aliases, shader path |
