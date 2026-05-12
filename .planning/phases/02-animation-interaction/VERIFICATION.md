# Phase 2: 动画与交互 — VERIFICATION

## Build Verification

### Vite Build
```bash
cd apps/desktop && npx vite build
```
**PASSED** — 103 modules transformed, 0 errors.

### TypeScript Type Check
```bash
cd apps/desktop && npx tsc --noEmit
```
**PASSED** — Zero errors in `src/` code. All TS errors are pre-existing in vendor Cubism SDK (`vendor/cubism/Framework/src/`).

---

## Plan 02-01: TTS 唇形同步

### Verification Criteria

| # | Criterion | Status | Notes |
|---|-----------|--------|-------|
| 1 | Amplitude smoothing via EMA | ✅ | `currentAmplitude += (targetAmplitude - currentAmplitude) * 0.2` |
| 2 | Hysteresis clamp (ignore < 0.05) | ✅ | `AMPLITUDE_CLAMP = 0.05` |
| 3 | Hysteresis band 0.02 | ✅ | `AMP_HYSTERESIS = 0.02` — prevents rapid open/close near threshold |
| 4 | `updateLipSync()` called in animation loop | ✅ | Called before `drawModel()` in `startLoop()` |
| 5 | Uses `CubismDefaultParameterId.MouthOpenY` | ✅ | Resolved via `CubismFramework.getIdManager().getId(...)` |

### Implementation Details
- **setSpeaking(speaking, amplitude):** Sets `targetAmplitude`. If speaking and amplitude > 0.05, clamps to 1.0. Otherwise sets to 0.
- **updateLipSync():** Applies EMA smoothing, then hysteresis logic:
  - Mouth currently open: stays open until amplitude < 0.03
  - Mouth currently closed: opens only when amplitude > 0.05
  - Only updates model parameter when change > 0.005 (jitter reduction)

---

## Plan 02-02: 鼠标跟随

### Verification Criteria

| # | Criterion | Status | Notes |
|---|-----------|--------|-------|
| 1 | Normalized -1..1 coordinate mapping | ✅ | `(x / canvas.width) * 2 - 1` with clamp to [-1, 1] |
| 2 | ParamAngleX × 30° | ✅ | `currentLookX * 30` |
| 3 | ParamAngleY × 15° | ✅ | `currentLookY * 15` |
| 4 | Lerp smoothing factor 0.1 | ✅ | `LOOK_LERP_FACTOR = 0.1` |
| 5 | `updateMouseFollow()` in animation loop | ✅ | Called before `drawModel()` |

### Implementation Details
- **lookAt(x, y):** Converts canvas pixel coords to normalized -1..1 coords, sets target.
- **resetPointer():** Resets both targets to 0 (center).
- **updateMouseFollow():** Applies EMA smoothing, then maps to angle parameters. Only updates when change > 0.001.

---

## Plan 02-03: 空闲动画

### Verification Criteria

| # | Criterion | Status | Notes |
|---|-----------|--------|-------|
| 1 | CubismBreath initialized with default params | ✅ | ParamBodyAngleX, ParamBreath, ParamAngleY |
| 2 | CubismEyeBlink auto-read from model setting | ✅ | `CubismEyeBlink.create(this.modelSetting)` — reads blink param IDs |
| 3 | `updateIdleEffects(deltaTimeSec)` called in loop | ✅ | Called before lip sync and mouse follow |
| 4 | deltaTime calculation from frame timestamps | ✅ | `performance.now()` delta |
| 5 | deltaTime clamped to 0.1s max | ✅ | `Math.min(deltaTimeSec, 0.1)` — prevents jump after tab switch |

### Implementation Details
- **initializeIdleEffects():** Called after model loaded, before startLoop. Creates breath with 3 parameters (amplitude 0.5, cycle 3.0s) and eye blink from model settings.
- **updateIdleEffects(deltaTimeSec):** Updates breath and eye blink on the model each frame.

---

## File Changes

**Modified:** `apps/desktop/src/features/pet/Live2DRenderer.ts`
- Added imports: `CubismBreath`, `BreathParameterData`, `CubismEyeBlink`
- Added fields: amplitude smoothing (4), mouse follow (6), idle animation (1)
- Rewrote: `setSpeaking()`, `lookAt()`, `resetPointer()`, `startLoop()`
- Added methods: `initializeIdleEffects()`, `updateLipSync()`, `updateMouseFollow()`, `updateIdleEffects()`

## Commit

```
0785519 feat(02-animation-interaction): TTS lip sync, mouse follow, idle animation for Live2D
```
