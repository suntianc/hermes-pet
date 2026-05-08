# Conventions: Hermes DeskPet

> Last updated: 2026-05-08

## Code Style

- **Strict TypeScript**: All files are `.ts` or `.tsx` with `strict: true` in tsconfig
- **No semicolons** (except in specific cases — review existing code before choosing)
- **Single quotes** for strings
- **4-space indentation** (TypeScript convention)
- **Explicit imports**: Named imports preferred over default imports
- **`import type`** for type-only imports (not consistently applied)

## TypeScript Configuration

### Renderer (`tsconfig.json`)
- Target: ES2022
- Module: ESNext (bundler resolution)
- JSX: `react-jsx` (automatic JSX transform)
- Strict mode enabled
- `noEmit: true` (Vite handles bundling)

### Main Process (`tsconfig.main.json`)
- Target: ES2022
- Module: CommonJS (node resolution)
- Strict mode enabled
- `outDir: ./dist/main`
- `declaration: true`, `sourceMap: true`

## Naming Patterns

| Category | Convention | Example |
|----------|-----------|---------|
| Files | `kebab-case` | `pet-event-schema.ts` |
| Components | PascalCase `.tsx` | `PetStage.tsx` |
| Classes | PascalCase | `Live2DRenderer`, `TTSManager` |
| Functions | camelCase | `normalizeAgentEvent()` |
| IPC channels | `namespace:action` | `pet:tts:speak` |
| Event types | PascalCase interfaces | `AgentEvent`, `PetStateEvent` |
| State types | Union discriminated | `TTSState = { status: 'idle' } | { status: 'playing'; text: string }` |
| SQL tables | snake_case | `model_actions` |

## Error Handling

### Pattern: Guard + Early Return
Example from `electron/tts/tts-manager.ts:96-98`:
```typescript
if (!text?.trim() || !this.config.enabled) {
  return null;
}
```

### Pattern: try/catch with typed error
Example from `electron/ipc.ts:155-173`:
```typescript
try {
  // ...
  return { ok: true, requestId };
} catch (err) {
  log.error('[IPC] TTS speak error:', err);
  return { ok: false, error: err instanceof Error ? err.message : 'Unknown error' };
}
```

### Global error handling
- `process.on('uncaughtException')` in `electron/main.ts:17` — logs + exits
- `process.on('unhandledRejection')` in `electron/main.ts:22` — logs only
- Renderer error display: `main.tsx:4-19` — shows errors on-page for debugging (dev convenience)
- `electron-log` for all error logging (file + console)

## Return Type Pattern

Functions return result objects with `ok: boolean`:
```typescript
interface AIPlanResult {
  ok: boolean;
  plan?: JsonRecord;
  error?: string;
}
```

This is used consistently across:
- `ai-planner.ts` — `AIPlanResult`
- `ipc.ts` — TTS speak returns `{ ok: true, requestId }` or `{ ok: false, error }`
- `adapter/server.ts` — JSON responses with `{ ok: true, ... }` or `{ ok: false, error }`

## Async Patterns

- **Events via IPC**: `ipcRenderer.send()` for fire-and-forget, `ipcRenderer.invoke()` for request/response
- **Queue**: `PetEventAggregator` + `petEventQueueRef` promise chain for serialized event application (`App.tsx:290-307`)
- **TTS Queue**: `TTSManager` has internal FIFO queue with `isProcessing` flag
- **Singletons**: Module-level `instance` variables for `get*Manager() / get*Service()` pattern
- **Window access**: `getPetWindow()` getter function (avoid stale refs)

## Model Management Conventions

- Custom `vivipet-assets://` protocol for user models
- `.zip` import format: extract → find `.model3.json` → validate → copy to `userData/models/<id>/`
- Path traversal protection: `resolveSafeUserModelPath()` — rejects `..` escapes
- Bundled models resolved via `resolveBundledModelPath()` (checks `process.resourcesPath` for packaged, `public/` for dev)
- SQLite index: `indexModelActions()` upserts model row, deletes stale actions, inserts all

## Event Pipeline Conventions

- External events normalized through `normalizeAgentEvent()` (handles multiple naming conventions)
- Phase aliases in `PHASE_ALIASES` map (snake_case → kebab-case normalization)
- Momentary actions have auto-reset via `scheduleIdle()`
- TTS and speech bubble are **mutually exclusive**: TTS enabled → audio; TTS disabled/fails → bubble
- `AudioPlayer` state: `speaking: true` → Live2D lip sync enabled → `speaking: false` → stop mouth animation

## Security Patterns

- **Sandboxed renderer**: `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`
- **contextBridge**: Only specific APIs exposed, no raw IPC access
- **Path traversal**: `resolveSafeUserModelPath()` validates relative path stays under model root
- **Request body size limit**: Adapter server rejects bodies > 1MB
- **No shell injection**: `say` command uses `child_process` but spawns raw arguments
- **API keys**: AI planner API key stored in config file (no encryption), transmitted to renderer for settings UI
