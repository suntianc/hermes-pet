# Concerns: Hermes DeskPet

> Last updated: 2026-05-08

## Technical Debt

### 1. No Testing Infrastructure
- **Severity**: HIGH
- **No test framework, test files, or test scripts exist**
- CI pipeline only verifies build succeeds — no type checking, linting, or test step
- Manual testing as sole verification method is fragile as the codebase grows
- **Impact**: Risk of regressions, especially in event pipeline (adapter → normalize → policy → renderer)
- **Mitigation**: Add Vitest for unit tests, Playwright for E2E (see TESTING.md)

### 2. ESLint Configured But Missing Config File
- `package.json` defines `"lint": "eslint src --ext .ts,.tsx"` but no `.eslintrc` or ESLint config file found
- **Severity**: MEDIUM
- `turbo run lint` would fail if attempted, or ESLint runs with defaults only
- **Impact**: No automated code quality enforcement beyond TypeScript `strict`
- **Mitigation**: Add ESLint config with TypeScript rules, or remove lint script

### 3. Type Safety Gaps with `window.electronAPI`
- `window.electronAPI` accessed via `(window as any).electronAPI` throughout `App.tsx`
- No global type augmentation being consistently used (though `preload.ts:142-146` declares the global type)
- **Severity**: LOW-MEDIUM
- **Impact**: Loses compile-time safety for renderer↔main IPC calls
- **Mitigation**: Use the declared `Window.electronAPI` type instead of `any` casts

### 4. Large Monolithic `App.tsx` (742 lines)
- **Severity**: MEDIUM
- Root component handles: model loading, TTS routing, AI config UI, event queue, settings panel, mouse passthrough, window management
- Many `useRef`, `useCallback`, and `useEffect` hooks with complex dependencies
- **Impact**: Hard to reason about, test, or refactor
- **Mitigation**: Extract settings panel to its own component, extract event handling into custom hooks

### 5. Inline Styles in `App.tsx`
- Settings panel UI built with inline `style` objects
- **Severity**: LOW
- No CSS modules or styled-components used
- **Impact**: Reduced readability, no design system, no theming
- **Mitigation**: Extract to CSS modules or use a styling solution

### 6. Singleton Pattern for Core Services
- `getAIPlannerService()`, `getTTSManager()`, `petStoreInstance` all use module-level singletons
- **Severity**: LOW
- Acceptable for Electron app with single window, but makes testing harder
- **Impact**: Services are stateful singletons — state persists across tests unless manually reset
- **Mitigation**: Add `reset()` methods or dependency injection

## Known Issues

### 1. TTS Provider Error Handling
- `tts-manager.ts:202-204`: When a TTS provider fails during playback, error is thrown and caught by `processItem()`, which sends `{ status: 'error' }` to renderer
- The renderer then falls back to speech bubble — but the fallback logic in `App.tsx:193-207` uses `pendingTTSFallbackRef` Map with timing/ordering issues
- **Impact**: If multiple TTS requests are queued, fallback text might be mismatched with the intended request

### 2. AI Planner `any` Casts
- `ai-planner.ts` uses heavy `as any` / `as JsonRecord` casting throughout
- `tool_calls.arguments` parsed with `JSON.parse(raw)` — no validation against the tool schema
- **Impact**: If the LLM returns malformed arguments, errors surface as opaque JSON parse failures
- **Mitigation**: Add Zod or io-ts validation for tool call arguments

### 3. SQLite Sync Operations
- `action-index.ts` uses `DatabaseSync` (Node.js `node:sqlite` synchronous API)
- Indexing runs synchronously on main process startup and model import
- **Impact**: Brief main process freeze during model indexing (acceptable for small models, but large models could cause UI unresponsiveness)
- **Mitigation**: Use async SQLite or move to worker thread for large imports

### 4. Config File Stores API Keys in Plaintext
- `ai-planner-config.ts` saves API key to `{userData}/ai-planner-config.json` as plaintext
- `tts-config.ts` saves cloud provider config (potentially with API keys) to `{userData}/tts-config.json` as plaintext
- **Severity**: MEDIUM
- **Impact**: API keys stored unencrypted on disk
- **Mitigation**: Use keychain APIs (macOS Keychain via `safeStorage`)

## Security Concerns

### 1. Adapter Server No Authentication
- HTTP Adapter on port 18765 accepts **any** local request with no auth
- **Severity**: LOW (localhost-only, port not exposed)
- Any local process can send pet events or query capabilities
- **Acceptable risk** for current use case (local agent integration only)

### 2. AI Planner API Key Exposure
- API key sent to renderer for settings panel display
- Stored in plaintext config file
- **Severity**: MEDIUM

## Performance Concerns

### 1. Live2D WebGL Rendering on Full-Screen Canvas
- Window is created at full display size for bottom-right anchoring
- Live2D model renders over entire canvas — unnecessary GPU work for empty areas
- **Severity**: LOW
- Models are typically small (few thousand polygons) but the canvas is full display resolution
- **Mitigation**: Limit canvas/webgl viewport to model-occupied area

### 2. `requestAnimationFrame` Always Running
- Live2D render loop runs continuously via `rAF` even when idle
- **Severity**: LOW
- Standard for real-time rendering, but could drain battery on laptops
- **Mitigation**: Add idle detection → pause `rAF` when model is still (no animation)

## Fragile Areas

### 1. Adapter Event Multi-Schema Aliasing
- `normalize.ts:30-58`: `PHASE_ALIASES` maps ~25+ different phase names/aliases
- New agent frameworks may send unexpected phase names → mapped to `'unknown'` → dropped
- **Impact**: Silent event drops when agent uses unexpected naming conventions
- **Mitigation**: Log `'unknown'` mappings for debugging, document expected schemas

### 2. System TTS macOS-Only
- `system-streamer.ts` relies on macOS `say` command
- On Windows/Linux, `system` TTS provider will fail silently
- **Severity**: MEDIUM
- **Impact**: Windows/Linux users get no TTS unless they configure local or cloud provider

### 3. Electron 41 API Deprecations
- Using `protocol.handle()` (Electron 25+) and `node:sqlite` `DatabaseSync` (Electron 38+)
- **Impact**: Need to track Electron deprecation schedule for future updates

### 4. Docker/Window Position Desktop Agnostic
- Window positioning in `window.ts:9`: Gets primary display bounds
- No multi-monitor awareness for position persistence
- **Impact**: Window always opens on primary display, doesn't restore previous position
- **Mitigation**: Persist window bounds and restore on startup
