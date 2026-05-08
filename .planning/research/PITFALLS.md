# Research: Rive Integration Pitfalls

> Generated: 2026-05-08

## Critical Pitfalls

### 1. WASM Loading Timing
**Issue**: `@rive-app/canvas` loads Rive WASM asynchronously. If you try to create a Rive instance before WASM is ready, it fails silently.

**Warning signs**: Rive constructor returns but nothing renders, no errors.

**Prevention**: Use `onLoad` callback or check `rive.loaded()` before interacting.
```typescript
const rive = new Rive({
  src: 'pet.riv',
  canvas: canvas,
  onLoad: () => {
    console.log('Rive ready');
    // Now safe to interact
  },
});

// Alternative: preload WASM
import { setWebAssemblyPath } from '@rive-app/canvas';
setWebAssemblyPath('/path/to/rive.wasm');

// Or pre-render:
import { preloadWasm } from '@rive-app/canvas';
await preloadWasm(); // Call once at app startup
```

**Phase**: Phase 1 (Initial integration)

### 2. Canvas Size Mismatch
**Issue**: Rive canvas must match the actual canvas element size. If CSS sizes differ from canvas resolution, Rive renders at wrong scale.

**Warning signs**: Pet appears tiny, stretched, or cut off.

**Prevention**: After canvas resize, always call `rive.resizeToCanvas()`.
```typescript
// After canvas size changes
canvas.width = newWidth * devicePixelRatio;
canvas.height = newHeight * devicePixelRatio;
rive.resizeToCanvas();
```

**Phase**: Phase 1

### 3. State Machine Input Name Mismatches
**Issue**: Rive State Machine input names are case-sensitive strings. If code uses `'is_speaking'` but the editor defines `'isSpeaking'`, nothing happens — no error.

**Warning signs**: State transitions don't work, but no console errors.

**Prevention**: 
- Define an enum/constants file for all input names, matching the Rive Editor definitions
- Validate on load by checking available inputs
```typescript
const INPUTS = {
  STATE: 'state',
  MOUTH_OPEN: 'mouth_open',
  TRIGGER: 'transition_trigger',
} as const;
```

**Phase**: Phase 1–2

### 4. Memory Leaks on Model Switching
**Issue**: Creating new Rive instances without cleaning up old ones causes memory leaks (WASM memory, canvas references).

**Warning signs**: Browser memory grows on each model switch.

**Prevention**: Always call `rive.cleanup()` before creating a new instance.
```typescript
if (currentRive) {
  currentRive.cleanup();
  currentRive = null;
}
currentRive = new Rive({ ... });
```

**Phase**: Phase 1

### 5. Electron Filesystem Loading
**Issue**: `new Rive({ src: 'file:///...' })` may not work in Electron sandboxed renderer. The `src` parameter expects HTTP/HTTPS URLs or Data URIs.

**Warning signs**: Model fails to load from local file paths.

**Prevention**: 
- Load `.riv` as ArrayBuffer via fetch/fs, then pass as `buffer` parameter
- Or serve via the existing `vivipet-assets://` custom protocol (already set up for model files)
```typescript
// Via URL (use custom protocol)
new Rive({ src: 'vivipet-assets://models/pet.riv', ... });

// Via ArrayBuffer (preferred for sandboxed renderer)
const response = await fetch('vivipet-assets://models/pet.riv');
const buffer = await response.arrayBuffer();
new Rive({ buffer, ... });
```

**Phase**: Phase 1

### 6. Live2D→Rive Concurrent Animations
**Issue**: Live2D supported simultaneous motion + expression layers. Rive State Machine handles transitions differently — one active state at a time by default.

**Warning signs**: Can't show expression + idle simultaneously.

**Prevention**: Use Rive State Machine layers to blend animations, or redesign animations to include expressions in each state's animation.

**Phase**: Phase 2 (Event system adaption)

### 7. TTS Lip Sync Timing
**Issue**: Live2D used `ParamMouthOpenY` driven by real-time audio RMS. Rive needs the same input mechanism but may have different response characteristics.

**Warning signs**: Mouth animation doesn't sync with audio.

**Prevention**: 
- Keep the existing RMS pipeline unchanged (StreamingAudioPlayer → PetStore → amplitude)
- Route amplitude to Rive input: `rive.setInputState('sm', 'mouth_open', rms)`
- Design Rive mouth animation as a simple blend shape driven by `mouth_open`

**Phase**: Phase 2

## Moderate Pitfalls

### 8. Version Mismatches
**Issue**: `@rive-app/canvas` auto-downloads WASM at runtime. If the npm package version doesn't match the WASM URL, features may break.

**Prevention**: Pin exact version in package.json. Test on version upgrades.

### 9. Device Pixel Ratio on Retina
**Issue**: On Retina displays (macOS), canvas size must account for `devicePixelRatio` for crisp rendering.

**Prevention**: Set `canvas.width = width * dpr` and `canvas.height = height * dpr`, then resize canvas CSS to `width x height`. Call `rive.resizeToCanvas()`.

### 10. Rive Editor vs Runtime Feature Parity
**Issue**: Not all Rive Editor features are supported in the canvas runtime (e.g., mesh deformations require WebGL runtime).

**Prevention**: Check `Feature Support` page for canvas runtime limitations before designing animations. If mesh deformations are needed, switch to `@rive-app/webgl2`.
