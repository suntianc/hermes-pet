# Structure: Hermes DeskPet

> Last updated: 2026-05-08

## Root Layout

```
hermes-pet/
├── apps/
│   └── desktop/          # Electron desktop app (main app)
├── packages/
│   ├── pet-action-dsl/   # Action DSL types
│   └── shared/           # Shared types
├── source/               # Project documentation sources
│   ├── docs/
│   └── example/
├── .github/workflows/    # CI + release pipelines
├── package.json          # Root monorepo config (yarn workspaces + turbo)
├── turbo.json            # Turborepo task definitions
└── CLAUDE.md             # AI assistance guide
```

## Desktop App (`apps/desktop/`)

### Main Process (`electron/`)
```
electron/
├── main.ts              # Entry: single-instance, init, boot sequence
├── window.ts            # BrowserWindow creation (frameless, transparent)
├── preload.ts           # contextBridge API surface
├── ipc.ts               # All IPC handlers (window, model, TTS, AI)
├── tray.ts              # System tray context menu
├── app-state.ts         # Shared isQuitting flag for close-to-tray
│
├── adapter/             # HTTP Adapter for external agent integration
│   ├── server.ts        # HTTP server (:18765), request routing
│   ├── normalize.ts     # Payload normalization (field aliases, phase mapping)
│   ├── policy.ts        # Phase→action mapping policy
│   └── protocol.ts      # Type definitions (AgentEvent, PetStateEvent, etc.)
│
├── tts/                 # Text-to-Speech engine
│   ├── tts-manager.ts   # Queue-based TTS core, provider dispatch
│   ├── tts-config.ts    # Config types, persistence (JSON file)
│   ├── text-utils.ts    # Text splitting (sentence → comma → hard split)
│   ├── audio-chunk.ts   # AudioChunk type definitions
│   ├── index.ts         # Public exports
│   └── streamers/
│       ├── system-streamer.ts  # macOS say command
│       ├── local-streamer.ts   # HTTP streaming to local TTS
│       └── cloud-streamer.ts   # OpenAI/ElevenLabs/Azure/Custom API
│
├── ai-planner.ts        # OpenAI function-calling behavior planner
├── ai-planner-config.ts # AI planner config types + persistence
├── model-manager.ts     # Model import (.zip), protocol handler, user model listing
└── action-index.ts      # SQLite-based action index (motions + expressions)
```

### Renderer (`src/`)
```
src/
├── main.tsx             # Renderer entry: load WASM → React bootstrap
├── index.html           # HTML shell
├── styles.css           # Global styles
├── App.tsx              # Root component (event hub, state wiring, settings UI)
│
├── components/
│   ├── PetStage.tsx      # Canvas container, Live2D lifecycle, input handling
│   └── SpeechBubble.tsx  # Text bubble overlay (timed/tts-sync)
│
├── stores/
│   └── pet-store.ts      # Singleton PetStore + usePetStore() React hook
│
├── audio/
│   └── streaming-player.ts  # Web Audio API player + RMS analysis
│
├── features/
│   ├── actions/
│   │   └── action-schema.ts    # ActionType definitions
│   │
│   ├── pet/                     # Live2D implementation
│   │   ├── Live2DRenderer.ts    # Cubism 5 WebGL renderer
│   │   ├── PetRenderer.ts       # Renderer interface abstraction
│   │   ├── model-registry.ts    # Model config loading & merging
│   │   └── capability-resolver.ts  # Action→motion/expression mapping
│   │
│   ├── pet-events/              # Event pipeline
│   │   ├── apply-pet-event.ts      # Apply external event → state changes
│   │   ├── behavior-context.ts     # Recent event history tracker
│   │   ├── behavior-plan.ts        # BehaviorPlan type + composeRuntimePlan
│   │   ├── behavior-planner.ts     # RuleBased + Hybrid planners
│   │   ├── pet-event-aggregator.ts # Debounce + dedup for incoming events
│   │   ├── pet-event-schema.ts     # Event type validation
│   │   └── pet-session-manager.ts  # Session lifecycle management
│   │
│   └── pet-performance/          # Performance/behavior coordination
│       └── pet-performance-director.ts  # Pose + speech coordination
│
└── vendor/
    └── cubism/           # Vendored Cubism 5 Framework SDK
```

### Public Assets (`public/`)
```
public/
├── assets/models/models.json     # Model registry (runtime JSON)
├── models/<ModelName>/           # Built-in Live2D models
│   ├── <Name>.model3.json
│   ├── <Name>.moc3
│   ├── motion/*.motion3.json
│   └── expression/*.exp3.json
├── Framework/Shaders/WebGL/      # WebGL shader files
└── live2dcubismcore.js           # Cubism Core WASM loader
```

### Config Files
```
apps/desktop/
├── package.json           # Dependencies, scripts
├── tsconfig.json          # Renderer TypeScript config
├── tsconfig.main.json     # Main process TypeScript config
├── vite.config.mts        # Vite bundler config
├── electron-builder.yml   # Packaging config (dmg, nsis, AppImage)
├── assets/icon.png        # App icon
├── scripts/               # Build/packaging shell scripts
└── release/               # Build artifacts (gitignored)
```

## Packages

### `packages/pet-action-dsl/`
```
src/index.ts     # DSL type definitions for pet actions
```

### `packages/shared/`
```
src/index.ts     # Shared type definitions
```

## Naming Conventions

- **Files**: `kebab-case.ts` (e.g., `pet-event-schema.ts`, `action-index.ts`)
- **React components**: PascalCase (e.g., `PetStage.tsx`, `SpeechBubble.tsx`)
- **Classes**: PascalCase (e.g., `Live2DRenderer`, `PetStore`, `TTSManager`)
- **Functions**: camelCase (e.g., `normalizeAgentEvent`, `toPetStateEvent`)
- **IPC channels**: `namespace:action` format (e.g., `pet:tts:speak`, `pet:window:setSize`)
- **Adapter phases**: `snake_case` normalized from various conventions
- **SQL tables**: `snake_case` (e.g., `model_actions`, `updated_at`)

## Key File Locations

| File | Significance |
|------|-------------|
| `electron/main.ts:43-63` | App init sequence (order matters: protocol → window → tray → IPC → TTS → adapter) |
| `electron/preload.ts:68-139` | Complete renderer API surface (the security boundary) |
| `electron/ipc.ts:18-214` | All IPC handlers in one file |
| `src/App.tsx:49-742` | Root component — event routing, TTS/bubble decision, settings |
| `src/App.tsx:247-288` | `handleSpeech()` — TTS vs bubble distributor |
| `src/App.tsx:290-307` | `queuePetEvent()` — serialized event application |
| `src/stores/pet-store.ts:45-130` | PetStore class — all state mutations |
| `electron/adapter/server.ts:95-143` | HTTP server entry, request routing |
| `electron/adapter/policy.ts:78-115` | Agent phase → pet action mapping |
| `electron/ai-planner.ts:376-475` | AI planner service with OpenAI tool calling |
| `electron/tts/tts-manager.ts:50-284` | TTS engine core (queue, provider dispatch) |
