# Research: Rive Integration Architecture

> Generated: 2026-05-08

## Proposed Architecture

### Before (Live2D)

```
PetStage.tsx
  └── Live2DRenderer.ts (~600+ lines)
       ├── Cubism SDK WASM
       ├── Cubism Framework (~200 files in vendor/)
       ├── WebGL shaders
       ├── Physics engine
       ├── Manual motion scheduling
       └── Lip sync via ParamMouthOpenY
```

### After (Rive)

```
PetStage.tsx
  └── RiveRenderer.ts (~250 lines)
       ├── @rive-app/canvas (single npm package)
       ├── State Machine (transitions built-in)
       └── Lip sync via input trigger
```

## Component Diagram

```
┌─────────────────────────────────────────────┐
│                  PetStage.tsx                 │
│  (canvas lifecycle, mouse events, resize)    │
│                                               │
│  ┌─────────────────────────────────────────┐ │
│  │          RiveRenderer.ts                │ │
│  │  (implements PetRenderer interface)     │ │
│  │                                          │ │
│  │  loadModel(url) → new Rive({...})        │ │
│  │  playAction(name) → setInput/trigger     │ │
│  │  setSpeaking(rms) → input value          │ │
│  │  lookAt(x,y) → joystick input            │ │
│  │  resize(w,h) → resizeToCanvas()          │ │
│  │  dispose() → rive.cleanup()              │ │
│  └─────────────────────────────────────────┘ │
└─────────────────────────────────────────────┘
```

## State Machine Design (Rive Editor)

Standard state machine structure for the pet:

```
                    ┌─────────┐
                    │  Idle   │◄──── default
                    └────┬────┘
          ┌──────────────┼──────────────┐
          │              │              │
     ┌────▼───┐    ┌────▼───┐    ┌────▼───┐
     │Thinking │    │Speaking│    │ Happy  │
     └────┬───┘    └────┬───┘    └────┬───┘
          │              │              │
     ┌────▼───┐    ┌────▼───┐    ┌────▼───┐
     │Searching│   │ Coding │    │ Error   │
     └─────────┘   └────────┘    └─────────┘
```

**Inputs needed:**
- Trigger: `transition_trigger` — fire to advance to next state
- String/Enum: `state` — direct state setting ("idle", "thinking", "speaking", etc.)
- Number: `mouth_open` — 0.0–1.0 for lip sync
- Number: `look_x`, `look_y` — for mouse following
- Boolean: `is_speaking` — toggle speaking state machine

## Pipeline Changes

### Loading Chain
```
App.tsx (modelIndex change)
  → PetStage useEffect
  → RiveRenderer.loadModel(url)
  → Create Rive instance from .riv file
  → State Machine auto-plays
```

### Action Chain
```
applyPetStateEvent → setAction('thinking')
  → PetStage useEffect (actionRevision++)
  → RiveRenderer.playAction('thinking')
  → rive.setInputState('sm', 'state', 'thinking')
  → State Machine transitions to Thinking state
  → Animation plays automatically
```

### Lip Sync Chain
```
StreamingAudioPlayer.onAmplitude(rms)
  → PetStore.setTTSAmplitude(rms)
  → RiveRenderer.setSpeaking(rms)
  → rive.setInputState('sm', 'mouth_open', rms)
  → Rive State Machine drives mouth animation
```

## Removed Components After Migration

| File/Folder | Status |
|-------------|--------|
| `src/vendor/cubism/` (~200 files) | Delete |
| `public/live2dcubismcore.js` | Delete |
| `public/Framework/` | Delete |
| `public/models/*.model3.json` | Delete (replace with .riv) |
| `src/features/pet/Live2DRenderer.ts` | Delete (→ RiveRenderer.ts) |
| `src/features/pet/PetRenderer.ts` | Keep (interface unchanged) |
| `src/features/pet/capability-resolver.ts` | Delete (Rive SM handles mapping) |
| `electron/action-index.ts` | Probable delete (SQLite not needed) |
| `electron/model-manager.ts` | Modify (Rive .riv import instead of .zip) |
| `src/features/pet/model-registry.ts` | Keep (model config pattern still valid) |

## Key Architectural Decision

Keep `PetRenderer` interface unchanged so the rest of the app (App.tsx, PetStage.tsx, event system) doesn't need modification. Only the implementation changes from `Live2DRenderer` to `RiveRenderer`.
