# Architecture: Hermes DeskPet

> Last updated: 2026-05-08

## Architectural Pattern

**Two-process Electron app** with React renderer, Live2D WebGL rendering, event-driven behavior system, and TTS pipeline.

```
┌─────────────────────────────────────────────────────────────┐
│                     Main Process (Node)                      │
│                                                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────────┐ │
│  │ Window   │  │ Tray     │  │ IPC      │  │ Adapter    │ │
│  │ Manager  │  │ Manager  │  │ Handlers │  │ Server     │ │
│  └──────────┘  └──────────┘  └──────────┘  │ (:18765)   │ │
│                                             └────────────┘ │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                  │
│  │ Model    │  │ Action   │  │ TTS      │                  │
│  │ Manager  │  │ Index    │  │ Manager  │                  │
│  └──────────┘  └──────────┘  └──────────┘                  │
│                                              ┌───────────┐ │
│  ┌──────────┐                                │ AI        │ │
│  │ AI       │◄── OpenAI API ──►              │ Planner   │ │
│  │ Planner  │                                │ Config    │ │
│  └──────────┘                                └───────────┘ │
├─────────────────────────────────────────────────────────────┤
│                  IPC (contextBridge)                          │
├─────────────────────────────────────────────────────────────┤
│                  Renderer Process (Chromium sandbox)          │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────┐ │
│  │ App.tsx      │──│ PetStore     │──│ PetStage          │ │
│  │ (Event Hub)  │  │ (State)      │  │ (Canvas + Live2D) │ │
│  └──────┬───────┘  └──────────────┘  └───────────────────┘ │
│         │                                                    │
│  ┌──────┴───────┐  ┌──────────────┐  ┌───────────────────┐ │
│  │ SpeechBubble │  │ AudioPlayer  │  │ PetEvent Pipeline  │ │
│  │ (React)      │  │ (Web Audio)  │  │ (Aggregators +    │ │
│  └──────────────┘  └──────────────┘  │  Planners)        │ │
│                                       └───────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## Layers

### 1. Main Process (`electron/`)
- **Entry**: `electron/main.ts` — single-instance lock, protocol registration, window/tray creation, IPC registration, Adapter server start, TTS init
- **Window**: `electron/window.ts` — frameless, transparent, always-on-top BrowserWindow (fullscreen-sized, bottom-right anchored via renderer)
- **Tray**: `electron/tray.ts` — system tray with context menu (Show/Hide, size, passthrough, mouse follow, TTS controls, model switching, import, quit)
- **IPC**: `electron/ipc.ts` — all IPC handlers (window control, model management, TTS, AI planner)
- **Model System**: `electron/model-manager.ts` + `electron/action-index.ts` — Live2D model registry, import (.zip), SQLite action indexing
- **Adapter**: `electron/adapter/` — HTTP server for external agent events (normalize → policy → renderer)
- **AI Planner**: `electron/ai-planner.ts` — OpenAI function calling for behavior planning
- **TTS**: `electron/tts/` — queue-based TTS engine with system/local/cloud providers

### 2. Preload Bridge (`electron/preload.ts`)
- `contextBridge.exposeInMainWorld('electronAPI', ...)`
- API surface: `petWindow`, `petModel`, `petTTS`, `petAI`, `onPetAction`, `onPetEvent`
- Sandboxed renderer — no `nodeIntegration`

### 3. Renderer (`src/`)
- **Entry**: `src/main.tsx` — dynamic Live2D Core WASM load → React bootstrap
- **App**: `src/App.tsx` — root component: model loading, event routing, TTS vs bubble decision, settings panel
- **PetStage**: `src/components/PetStage.tsx` — HTML canvas, Live2D renderer lifecycle, mouse tracking/drag/click, lip sync
- **SpeechBubble**: `src/components/SpeechBubble.tsx` — timed or TTS-sync text bubble overlay
- **Store**: `src/stores/pet-store.ts` — singleton PetStore with React hook (`usePetStore`)

### 4. Pet Event Pipeline (`src/features/pet-events/`)
- **Event Flow**: `Adapter event` → `PetEventAggregator` → `applyPetStateEvent` → `PetStore state changes` → `PetStage re-render`
- **Behavior Planner**: Rule-based (`RuleBasedBehaviorPlanner`) or AI (`HybridBehaviorPlanner`) or hybrid
- **Session Manager**: Tracks ongoing agent sessions, schedules context refreshes
- **Behavior Context**: Maintains recent event history for planner input

### 5. Live2D Rendering (`src/features/pet/`)
- **PetRenderer**: Abstract interface (`loadModel`, `playAction`, `setSpeaking`, `lookAt`, `resize`)
- **Live2DRenderer**: Cubism 5 implementation — `.moc3` loading, textures, physics, WebGL render loop
- **Model Registry**: `model-registry.ts` — merges built-in models.json + user models via IPC
- **Capability Resolver**: Maps action names to specific motion groups/expression files

### 6. Audio Pipeline (`src/audio/`)
- **StreamingAudioPlayer**: Web Audio API, accumulates audio chunks → decodes → plays, real-time RMS amplitude analysis for lip sync

## Data Flow

### Event Pipeline (Adapter → Pet)
```
POST /adapter → server.ts → normalizeAgentEvent() → toPetStateEvent()
  → IPC pet:event → App.tsx onPetEvent → PetEventAggregator
  → applyPetStateEvent() → petStore.setAction() → PetStage re-render
  → Live2DRenderer.playAction() → motion playback
  → if speech: handleSpeech() → TTS or bubble
```

### TTS Pipeline
```
handleSpeech(event, tts=true)
  → IPC pet:tts:speak → TTSManager.queue
  → System: macOS say (direct audio via spawn)
  → Local: HTTP stream → audio chunks → IPC → StreamingAudioPlayer
  → Cloud: API stream → audio chunks → IPC → StreamingAudioPlayer
  → RMS amplitude → PetStore → Live2DRenderer lip sync
```

### Model Loading
```
App mount → loadModelConfigs() → fetch(models.json) + IPC listUserModels
  → merge → select model → PetStage → Live2DRenderer.loadModel()
  → Cubism 5: moc3 → textures → physics → setup → render loop
```

### AI Behavior Planning
```
ApplyPetStateEvent
  → RuleBasedBehaviorPlanner.plan() (always runs first)
  → If AI enabled: AIPlannerService.plan() → OpenAI tool calls → sanitize
  → Hybrid: compare AI vs rule, pick best
  → ComposeBehaviorPlan → setAction + setExpression + setProps + speech
```

## Key Abstractions

- **ActionType**: Semantic action types from `action-schema.ts` (idle, thinking, speaking, happy, etc.)
- **BehaviorPlan**: Structured plan with pose, playback, expression, intensity, interrupt, speech, props
- **TTSConfig**: Persisted config with source (none/system/local/cloud), voice, provider settings
- **PetTTSOptions**: Per-speech TTS options (voice, model: preset/clone/instruct)
- **AgentEvent**: Normalized external event (phase, action, text, tts options)
- **PetStateEvent**: Internal event for renderer (action, mode, text, source metadata)
