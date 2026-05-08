# Research: Rive Integration Stack

> Generated: 2026-05-08

## Recommended Stack

### Rive Web Runtime
- **Package**: `@rive-app/canvas` v2.37.5 (or latest)
- **Type**: TypeScript declarations built-in
- **Size**: Extremely small download (canvas-based, no WebGL context limit)
- **License**: MIT
- **Alternative**: `@rive-app/webgl2` — better for mesh deformations and complex raster graphics. For a vector character, `@rive-app/canvas` is recommended.

### Why @rive-app/canvas
1. Matches Live2D replacement need — single character display
2. No WebGL context limit — simpler rendering pipeline
3. CanvasRenderingContext2D renderer — native browser support
4. Very small bundle size vs WebGL runtime
5. Supports all needed features: animations, state machines, audio events

### Integration Layers
- **Low-level**: `@rive-app/canvas` directly (manual canvas management)
- **React wrapper**: `@rive-app/react-canvas` — optional, if we want a <Rive> component
- **Recommendation**: Use low-level API for PetStage control (we already manage the canvas in `PetStage.tsx`), but evaluate the React wrapper

### Bundling
- Rive WASM (~1.5MB) auto-loaded by the runtime
- Can preload WASM via `setWebAssemblyPath()` / `preloadWasm()` for faster startup
- `.riv` files can be served from `public/models/` similar to current model setup

### Peer Dependencies
- None — `@rive-app/canvas` has zero dependencies
- Works with Electron 41 (Chromium-based, supports Canvas2D)

## Development Workflow

1. Install: `npm install @rive-app/canvas`
2. Design `.riv` files in Rive Editor
3. Export `.riv` files → place in `public/models/`
4. Load at runtime via `new Rive({ src: '/models/pet.riv', artboard: 'main', stateMachine: 'StateMachine 1' })`
5. Drive State Machine inputs from event system

## Comparison: Live2D → Rive

| Aspect | Live2D Cubism 5 | Rive |
|--------|-----------------|------|
| Runtime size | ~2MB+ (WASM + Framework) | ~1.5MB (WASM) |
| Code complexity | ~200 files vendored | Single npm package |
| State machine | Custom (motion groups) | Built-in State Machine |
| Mesh deformation | Yes | Yes (if using webgl2) |
| Vector graphics | Raster-based | Native vector |
| Animation type | Timeline-based | Timeline + State Machine |
| Runtime control | Motion group + index | Inputs (trigger, number, boolean) |
| Bundle size (app code) | `Live2DRenderer.ts` ~600+ lines | ~200-300 lines expected |
