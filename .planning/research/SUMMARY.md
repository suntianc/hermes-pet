# Research Summary: Live2D → Rive Migration

> Generated: 2026-05-08

## Key Findings

### Stack Decision
Use **`@rive-app/canvas` v2.37.5** as the Rive runtime. Canvas renderer is sufficient for vector pet characters, has a tiny bundle, zero dependencies, and works in Electron's Chromium sandbox. Switch to `@rive-app/webgl2` only if mesh deformations are needed.

### Architecture Approach
Keep the `PetRenderer` interface unchanged. Create `RiveRenderer.ts` (~250 lines) as the new implementation. This isolates the migration to a single file change at the PetStage level — the entire event pipeline, TTS system, and AI planner remain untouched.

### Required State Machine Inputs
- `state` (string) — Direct state control: "idle", "thinking", "speaking", "happy", "error", etc.
- `mouth_open` (number) — 0.0–1.0 for RMS-driven lip sync
- `look_x` / `look_y` (number) — Mouse following
- `transition_trigger` (trigger) — For sequence-based transitions

### Files to Delete
- `src/vendor/cubism/` (~200 files) — Entire Cubism Framework SDK
- `public/live2dcubismcore.js` — Cubism Core WASM loader
- `public/Framework/` — WebGL shaders
- `public/models/*` — Live2D model files
- `src/features/pet/Live2DRenderer.ts`
- `src/features/pet/capability-resolver.ts`
- `electron/action-index.ts` — SQLite action index (not needed for Rive)

### Files to Create
- `src/features/pet/RiveRenderer.ts` — New PetRenderer implementation
- `.riv` model files in `public/models/` (to be provided by user)

### Files to Modify
- `electron/model-manager.ts` — Adapt for .riv file import instead of .zip
- `src/features/pet/model-registry.ts` — Update model config schema for Rive
- `src/main.tsx` — Remove Live2D WASM loading, optionally preload Rive WASM
- `vite.config.mts` — Remove @framework alias
- `tsconfig.json` — Remove @framework path alias

### Critical Gotchas
1. **WASM loading**: Must wait for Rive WASM to load before creating instances
2. **Canvas sizing**: Must call `rive.resizeToCanvas()` after resize + account for devicePixelRatio
3. **Input names**: Case-sensitive strings — define as constants matching editor names
4. **Cleanup**: Must call `rive.cleanup()` before creating new instances to avoid memory leaks
5. **Filesystem loading**: Use ArrayBuffer or custom protocol (not file://) in sandboxed renderer

### Build Order
1. **Phase 1**: Install package, create RiveRenderer with basic .riv loading + State Machine playback
2. **Phase 2**: Wire up event system (action → state input), lip sync, mouse following
3. **Phase 3**: Remove all Live2D code, delete vendor files, update model registry
4. **Phase 4**: Adapt model import system for .riv files, clean up unused modules
