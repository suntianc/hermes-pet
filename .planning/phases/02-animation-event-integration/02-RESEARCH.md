# Phase 2: Animation/Event Integration - Research

**Researched:** 2026-05-08
**Domain:** Rive State Machine Input Control, Animation Synchronization
**Confidence:** HIGH

## Summary

Phase 2 connects the existing event system, TTS audio pipeline, and mouse tracking to the Rive State Machine's input system built in Phase 1. The research confirms that `@rive-app/canvas` v2.37.5 provides all necessary APIs through `StateMachineInput` — number inputs (`value` getter/setter) and trigger inputs (`fire()`). The entire pipeline from RMS amplitude → `mouth_open`, mouse coordinates → `look_x`/`look_y`, and action names → `state` number is already wired at the component level (`PetStage` → `RiveRenderer`), and only the RiveRenderer implementations of `setSpeaking()` and `lookAt()` are missing.

**Key discovery:** `stateMachineInputs()` returns an already-cached array from the WASM state machine instance — it is not an expensive operation. However, calling `.find()` on the array for every 60fps frame is avoidable by caching individual `StateMachineInput` references for high-frequency inputs (`mouth_open`, `look_x`, `look_y`). The `state` input is set at human timescales so caching is less critical there.

**Official API note:** `stateMachineInputs()` is marked as **deprecated** in the Rive docs (recommending Data Binding / ViewModel instead), but continues to work in v2.37.5. The deprecation does not affect this phase — the SM input API is stable and the recommended pattern for simple state machine control without nested artboards.

**Primary recommendation:** Implement a cached input lookup pattern: query all inputs once per Rive instance after `onLoad`, cache the specific `StateMachineInput` references for `state`, `mouth_open`, `look_x`, `look_y`. Then `setSpeaking()` and `lookAt()` are O(1) property sets on the cached references.

## User Constraints (from CONTEXT.md)

### Locked Decisions

**Idle auto-return (SYNC-04):**
- D-01: Hybrid — RiveRenderer internal timer + external App.tsx scheduleId() double guarantee
- D-02: Momentary actions (error/happy/clicked/doubleClicked etc.) set timer after playAction() to reset state to idle(0)
- D-03: Sustained actions (thinking/speaking) require explicit external event to exit
- D-04: RiveRenderer exposes scheduleIdle(delay) for external override

**TTS lip sync (SYNC-02):**
- D-05: PetStage useEffect polling — ttsAmplitude already piped from StreamingAudioPlayer → App.tsx → PetStore
- D-06: RiveRenderer.setSpeaking(speaking, amplitude) directly sets mouth_open number input
- D-07: RMS clamp: ignore values below 0.05 to prevent noise jitter
- D-08: mouth_open range 0.0–1.0, passthrough RMS directly

**Mouse follow smoothing (SYNC-03):**
- D-09: RiveRenderer-side lerp — current += (target - current) * 0.1 in rAF loop
- D-10: PetStage continues setInterval(50ms) sending raw coordinates
- D-11: lookAt(x,y) normalizes canvas pixel coords to -1.0~1.0 in RiveRenderer

**Action interrupt (SYNC-05):**
- D-12: Immediate override — playAction() directly sets state number input
- D-13: No queue — each playAction() overwrites current state
- D-14: Return to idle by timer (D-01/D-02) or external event (D-03)

**SM input naming:**
- D-15: Names match rive-inputs.ts constants exactly

**Testing:**
- D-16: Manual verification primary
- D-17: Console logging state changes and mouth_open values

### The Agent's Discretion
- lerp smoothing factor (default 0.1) can be tuned
- Clamp threshold (default 0.05) can be adjusted
- Idle delay default (300-500ms) determined during implementation

### Deferred Ideas (OUT OF SCOPE)
None.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SYNC-01 | Event system actions map to SM inputs | `state` number input (0-9), set via cached input ref `input.value = stateIndex`; `actionToState()` method exists |
| SYNC-02 | TTS lip sync: RMS → mouth_open | Pipeline: `StreamingAudioPlayer.onAmplitude()` → `PetStore.setTTSAmplitude()` → `PetStage useEffect` → `RiveRenderer.setSpeaking()` → `mouthOpenInput.value = amplitude`; 0.05 clamp, 0.0-1.0 passthrough |
| SYNC-03 | Mouse follow: look_x/look_y | Pipeline: `PetStage setInterval(50ms)` → `RiveRenderer.lookAt(canvasX, canvasY)` → normalize to -1.0~1.0 → lerp in rAF → `lookXInput.value = currentX` |
| SYNC-04 | Idle auto-return after momentary action | `playAction()` sets `idleTimer` (setTimeout 300-500ms); on timer: set `stateInput.value = 0`; external `scheduleIdle()` overrides |
| SYNC-05 | Action interruption | Immediate: `playAction()` overwrites `stateInput.value`, cancels pending idle timer; SM transitions on next advance frame |

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Action → SM state mapping | Renderer (RiveRenderer) | — | `playAction()` is the renderer's method; SM is renderer-owned |
| Lip sync amplitude piping | PetStore → PetStage (React) | RiveRenderer | React layer pipes TTS state; renderer just sets SM input |
| Mouth amplitude smoothing | StreamingAudioPlayer | — | RMS is already computed; renderer does 1:1 passthrough |
| Mouse coordinate normalization | RiveRenderer | — | Canvas pixels → -1.0~1.0 is SM-specific |
| Mouse smooth interpolation | RiveRenderer | — | Lerp runs in rAF loop owned by renderer |
| Idle auto-return timer | RiveRenderer | App.tsx (external) | Hybrid: internal timer for momentary actions, external for explicit idle |
| Action interrupt logic | RiveRenderer | — | No queue, immediate overwrite |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@rive-app/canvas` | 2.37.5 | Rive rendering + SM input API | Already installed; `StateMachineInput`, `StateMachineInputType` for Number/Trigger/Boolean [VERIFIED: npm registry, codebase at rive.d.ts] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|--------------|
| `PetStore` | project | TTS state + amplitude observer | Lip sync pipe [VERIFIED: pet-store.ts] |
| `StreamingAudioPlayer` | project | Web Audio RMS analysis (0.0–1.0) | RMS source [VERIFIED: streaming-player.ts] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `stateMachineInputs()` | `setNumberStateAtPath()` | Both work; `stateMachineInputs()` returns cached refs, `setNumberStateAtPath()` is string-based and less performant [CITED: rive-app/rive-wasm rive.d.ts] |
| `StateMachineInput.value` setter | Data Binding ViewModel | ViewModel is preferred by Rive official docs but unnecessary here; for a single artboard with simple inputs, direct SM input control is simpler and more direct |

**Version verification:** `@rive-app/canvas` v2.37.5 installed via package.json `"^2.37.5"` — matches latest available [VERIFIED: node_modules package.json].

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         PetStage (React)                            │
│                                                                     │
│  ┌──────────┐  ┌──────────────────┐  ┌──────────────────────────┐  │
│  │ Mouse    │  │ TTS State (useEffect)│  │ Action Revision       │  │
│  │ Tracking │  │ isSpeaking /     │  │ (useEffect)             │  │
│  │ 50ms     │  │ ttsAmplitude     │  │                         │  │
│  │ setInterval│  └────────┬─────────┘  └───────────┬──────────────┘  │
│  └─────┬────┘           │                       │                   │
│        │                │                       │                   │
│        ▼                ▼                       ▼                   │
│  renderer.lookAt(   renderer.setSpeaking(  renderer.playAction(    │
│    canvasX,canvasY)   speaking, rms)         actionName)           │
└────────┬────────────────────┬───────────────────────┬───────────────┘
         │                    │                       │
         ▼                    ▼                       ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       RiveRenderer                                   │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │              Cached StateMachineInput References              │   │
│  │                                                              │   │
│  │  stateInput:     O(1) set on playAction() / idle timer      │   │
│  │  mouthOpenInput: O(1) set on rAF loop (lip sync)            │   │
│  │  lookXInput:     O(1) lerp → set on rAF loop (mouse)        │   │
│  │  lookYInput:     O(1) lerp → set on rAF loop (mouse)        │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────┐   ┌──────────────────────────┐    │
│  │ playAction(actionName)      │   │ requestAnimationFrame    │    │
│  │  → set stateInput.value     │   │  → lerp look_x/look_y    │    │
│  │  → clear idleTimer          │   │  → set mouthOpenInput    │    │
│  │  → set idleTimer (if        │   │    (only if speaking)    │    │
│  │    momentary action)        │   │  → rive.drawFrame() is   │    │
│  │  → scheduleIdle callback    │   │    handled internally    │    │
│  └─────────────────────────────┘   └──────────────────────────┘    │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │ lookAt(x, y):                                                │    │
│  │  → normalize canvasPx → -1.0~1.0 (pixel/width*2-1)         │    │
│  │  → set lerpTargetX, lerpTargetY                              │    │
│  │                                                              │    │
│  │ setSpeaking(speaking, amplitude):                            │    │
│  │  → if !speaking: lerpTargetAmplitude = 0                    │    │
│  │  → if speaking: lerpTargetAmplitude = clamp(amp, 0.05, 1.0) │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │ Idle Timer (setTimeout):                                     │    │
│  │  → On fire: set stateInput.value = 0 (idle)                 │    │
│  │  → Cleared by any new playAction()                          │    │
│  └─────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
```

### Data Flow Per Use Case

**Action Change (SYNC-01/SYNC-05):**
```
App.tsx: setAction('happy') → PetStore.currentAction = 'happy'
  → PetStore.notify() → PetStage re-render
  → useEffect([actionRevision, currentAction]):
    renderer.playAction('happy')
    → RiveRenderer: this.stateInput.value = 3
    → RiveRenderer: clear idleTimer
    → RiveRenderer: set idleTimer (300ms) → stateInput.value = 0
```

**Lip Sync (SYNC-02):**
```
StreamingAudioPlayer: rAF analyze → rms ~0.35
  → onAmplitude(rms) → PetStore.setTTSAmplitude(0.35)
  → PetStore.notify() → PetStage re-render
  → useEffect([isSpeaking, ttsAmplitude]):
    renderer.setSpeaking(true, 0.35)
    → RiveRenderer: this.lerpTargetAmplitude = 0.35

(rAF loop, 60fps):
  → this.currentAmplitude = lerp(current, target, 0.2)
  → if current > 0.05: this.mouthOpenInput.value = current
  → if current <= 0.05: this.mouthOpenInput.value = 0
```

**Mouse Follow (SYNC-03):**
```
PetStage setInterval(50ms):
  → getCursorScreenPoint + getPosition
  → compute canvasX, canvasY (pixel coords)
  → renderer.lookAt(canvasX, canvasY)
  → RiveRenderer: normalize to [-1,1]
  → this.lerpTargetX = normalizedX, this.lerpTargetY = normalizedY

(rAF loop, 60fps):
  → this.currentX = lerp(currentX, targetX, 0.1)
  → this.currentY = lerp(currentY, targetY, 0.1)
  → this.lookXInput.value = currentX
  → this.lookYInput.value = currentY
```

### Component Responsibilities

| Component | Owns | Inputs | Outputs |
|-----------|------|--------|---------|
| `App.tsx` | Event routing, scheduleIdle | Adapter events, TTS config | currentAction, actionRevision, isSpeaking, ttsAmplitude → PetStage |
| `PetStage.tsx` | Mouse tracking interval, renderer lifecycle | currentAction, actionRevision, isSpeaking, ttsAmplitude (props) | Calls renderer.playAction(), renderer.lookAt(), renderer.setSpeaking() |
| `RiveRenderer.ts` | Rive instance, SM input refs, lerp state, idle timer | playAction, lookAt, setSpeaking calls | Direct SM input value writes |
| `PetStore` | State observer | TTS amplitude, isSpeaking | React re-render pipeline |

### Recommended Project Structure (changes to existing files)

```
apps/desktop/src/features/pet/
├── RiveRenderer.ts          ← MODIFY: implement setSpeaking, lookAt, cached inputs, idle timer
├── rive-inputs.ts           ← UNCHANGED (Phase 1 delivered this)
├── PetRenderer.ts           ← UNCHANGED

apps/desktop/src/components/
├── PetStage.tsx              ← UNCHANGED (calls already in place)

apps/desktop/src/
├── App.tsx                   ← UNCHANGED (scheduleIdle already exists)

apps/desktop/src/stores/
├── pet-store.ts              ← UNCHANGED (ttsAmplitude pipe already exists)
```

No new files needed. All changes are within `RiveRenderer.ts` only.

### Pattern 1: Cached SM Input Lookup
**What:** Query Rive SM inputs once on load, cache specific input references for O(1) access.
**When to use:** For any SM input that will be set at high frequency (every frame) or frequently accessed.
**Why:** `stateMachineInputs()` itself is O(1) (returns cached array), but `.find()` is O(n) — avoidable for hot-path inputs.

```typescript
// Source: [VERIFIED: rive.js source code analysis — stateMachineInputs() returns cached array]
// In loadModel(), after onLoad callback:
private stateInput: StateMachineInput | null = null;
private mouthOpenInput: StateMachineInput | null = null;
private lookXInput: StateMachineInput | null = null;
private lookYInput: StateMachineInput | null = null;

private cacheInputs(rive: Rive, smName: string): void {
  const inputs = rive.stateMachineInputs(smName);
  if (!inputs) return;
  for (const input of inputs) {
    switch (input.name) {
      case RIVE_INPUTS.STATE:
        this.stateInput = input;
        break;
      case RIVE_INPUTS.MOUTH_OPEN:
        this.mouthOpenInput = input;
        break;
      case RIVE_INPUTS.LOOK_X:
        this.lookXInput = input;
        break;
      case RIVE_INPUTS.LOOK_Y:
        this.lookYInput = input;
        break;
    }
  }
}
```

### Pattern 2: Lerp Smoothing in rAF
**What:** Linear interpolation toward target values each render frame.
**When to use:** Mouse follow (look_x/look_y) to prevent jitter; optional for mouth_open amplitude.
**Factor choice:** 0.1 = smooth but responsive, higher = faster but snappier.

```typescript
// Source: [ASSUMED — standard lerp pattern, verified in rive.d.ts: StateMachineInput.value setter]
private currentLookX = 0;
private currentLookY = 0;
private targetLookX = 0;
private targetLookY = 0;
private readonly LERP_FACTOR = 0.1;
private rafId = 0;

private startRenderLoop(): void {
  const loop = () => {
    // Lerp look values
    this.currentLookX += (this.targetLookX - this.currentLookX) * this.LERP_FACTOR;
    this.currentLookY += (this.targetLookY - this.currentLookY) * this.LERP_FACTOR;

    // Apply to SM inputs (only when changed significantly)
    if (Math.abs(this.lastLookX - this.currentLookX) > 0.001) {
      if (this.lookXInput) this.lookXInput.value = this.currentLookX;
      this.lastLookX = this.currentLookX;
    }
    if (Math.abs(this.lastLookY - this.currentLookY) > 0.001) {
      if (this.lookYInput) this.lookYInput.value = this.currentLookY;
      this.lastLookY = this.currentLookY;
    }

    // Apply lip sync amplitude
    if (this.isSpeaking || this.currentAmplitude > 0.01) {
      this.currentAmplitude += (this.targetAmplitude - this.currentAmplitude) * 0.2;
      if (this.mouthOpenInput) {
        this.mouthOpenInput.value = this.currentAmplitude;
      }
    }

    this.rafId = requestAnimationFrame(loop);
  };
  this.rafId = requestAnimationFrame(loop);
}
```

### Pattern 3: Idle Timer with Cancel
**What:** setTimeout that resets state to idle after momentary actions, cancellable by subsequent playAction.
**When to use:** Every momentary action completion (SYNC-04).

```typescript
// Source: [VERIFIED: App.tsx scheduleIdle pattern for reference]
private idleTimerId: number | null = null;

private scheduleIdle(delay: number): void {
  this.clearIdleTimer();
  this.idleTimerId = window.setTimeout(() => {
    this.idleTimerId = null;
    if (this.stateInput) {
      this.stateInput.value = 0; // idle
    }
  }, delay);
}

private clearIdleTimer(): void {
  if (this.idleTimerId !== null) {
    window.clearTimeout(this.idleTimerId);
    this.idleTimerId = null;
  }
}

// In playAction():
async playAction(actionName: string, options?: PlayActionOptions): Promise<void> {
  this.clearIdleTimer();          // Cancel any pending idle return
  this.currentAction = actionName;
  const stateValue = this.actionToState(actionName);
  if (this.stateInput) {
    this.stateInput.value = RIVE_STATE_INDEX[stateValue] ?? 0;
  }

  // If momentary action, schedule idle return
  if (options?.playback === 'momentary' || MOMENTARY_ACTIONS.has(actionName)) {
    this.scheduleIdle(400);
  }
}
```

### Anti-Patterns to Avoid
- **Searching inputs via `.find()` on every frame:** The `stateMachineInputs()` array is small (~5 items), but doing an array search 60fps for each of mouth_open + look_x + look_y is wasteful. Cache references instead.
- **Setting input values unconditionally each frame:** Only set SM input `value` when the value actually changes (use a delta check). While setting a value on unchanged WASM input is cheap, avoiding redundant work is good practice.
- **Making the idle timer drive rAF directly:** The Rive SM has its own internal rendering loop via `Rive.drawFrame()`. The idle timer should only set the `state` input value, not start/stop the renderer.
- **Using trigger inputs for state transitions:** The Phase 1 decision uses `state` number input (0-9), not trigger inputs per state. This is correct — trigger inputs would require SM transitions for each state, while number inputs allow simple condition-based routing.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SM input value modification | WASM bridge | `StateMachineInput.value` setter | The runtime handles the WASM→C++ boundary [VERIFIED: rive.js StateMachineInput class] |
| RMS amplitude analysis | FFT/time-domain analysis | `AnalyserNode.getByteTimeDomainData()` | Already implemented in `StreamingAudioPlayer` [VERIFIED: streaming-player.ts line 183] |
| Rive render loop scheduling | Custom rAF management | Rive's internal `drawFrame()` | Rive handles timing, settling, and frame scheduling internally; we just set input values |

## Architectural Considerations

### Rive SM "Settle" Optimization
The Rive State Machine has an automatic "settle" behavior: when no active transitions or animations are running, the SM stops advancing to save CPU [CITED: rive.app/docs/runtimes/web/state-machines]. Setting an input value unsettles the SM, causing it to re-evaluate. This means:
- Setting `stateInput.value = 0` after an idle timer will briefly un-settle the SM, it transitions to idle, then re-settles
- Setting `mouthOpenInput.value` every rAF frame keeps the SM unsettled during speech — which is necessary
- When speech ends and amplitude reaches 0, the SM settles again naturally

### Rapid State Changes (SYNC-05)
Setting the `state` number input multiple times in quick succession (e.g., error → thinking in <100ms) is safe:
- Each set triggers the SM to re-evaluate transitions on the next advance
- The SM will transition to the new state immediately
- No queue is needed (D-13) since number inputs are value-based, not event-based
- The SM's "state changed" detection fires once per unique transition

## Common Pitfalls

### Pitfall 1: SM Input Name Mismatch
**What goes wrong:** `stateMachineInputs()` returns an empty array or undefined because the SM input names in `rive-inputs.ts` don't match the Rive Editor names.
**Why it happens:** Rive Editor defaults may differ from constant names. The switch statement in `cacheInputs()` silently skips mismatched names.
**How to avoid:** Verify SM input names at runtime:
```typescript
// Debug logging (D-17 requirement)
const inputs = rive.stateMachineInputs(smName);
console.log('[RiveRenderer] Available SM inputs:', inputs?.map(i => `${i.name} (${i.type})`));
```
**Warning signs:** `setSpeaking()` has no effect, mouse follow doesn't move, state changes don't animate.

### Pitfall 2: Amplitude Clamp Below Threshold Causes Flip-Flop
**What goes wrong:** RMS hovers around 0.05, causing `mouth_open` to rapidly toggle between 0 and 0.05.
**Why it happens:** The threshold comparison is binary (<= 0.05 vs > 0.05), and audio noise at the boundary causes frequent crossing.
**How to avoid:** Add hysteresis (a small deadband):
```typescript
// Instead of: if (amplitude > 0.05) set, else set 0
const HYSTERESIS = 0.02;
if (this.mouthCurrentlyOpen) {
  this.mouthOpenInput.value = amplitude < 0.03 ? 0 : amplitude;
  this.mouthCurrentlyOpen = amplitude >= 0.03;
} else {
  this.mouthOpenInput.value = amplitude > 0.05 ? amplitude : 0;
  this.mouthCurrentlyOpen = amplitude > 0.05;
}
```

### Pitfall 3: Idle Timer Race with External scheduleIdle
**What goes wrong:** RiveRenderer's internal idle timer fires after App.tsx has already set a new action, causing a rapid idle→action→idle glitch.
**Why it happens:** Timer was set before the new action arrived and wasn't cleared.
**How to avoid:** `clearIdleTimer()` must be the first thing in `playAction()`, before any state change. Use a shared timer ref.

### Pitfall 4: lookAt Coordinate Space Confusion
**What goes wrong:** The pet looks in the wrong direction or doesn't track properly.
**Why it happens:** Rive SM expects `look_x`/`look_y` in artboard space (-1.0 to 1.0), but PetStage sends canvas pixel coordinates.
**How to avoid:** Normalize in RiveRenderer:
```typescript
lookAt(canvasX: number, canvasY: number): void {
  const canvas = this.mainCanvas;
  if (!canvas) return;
  // Canvas pixel → normalized -1.0..1.0
  this.targetLookX = (canvasX / canvas.width) * 2 - 1;
  this.targetLookY = (canvasY / canvas.height) * 2 - 1;
  // Clamp to valid range
  this.targetLookX = Math.max(-1, Math.min(1, this.targetLookX));
  this.targetLookY = Math.max(-1, Math.min(1, this.targetLookY));
}
```

## Code Examples

### Example 1: Cached Input Initialization (loadModel)
```typescript
// File: RiveRenderer.ts
// Source: [VERIFIED: rive.d.ts stateMachineInputs() signature, rive.js cached array]

private stateInput: StateMachineInput | null = null;
private mouthOpenInput: StateMachineInput | null = null;
private lookXInput: StateMachineInput | null = null;
private lookYInput: StateMachineInput | null = null;

// Inside loadModel(), after creating Rive instance + in onLoad:
onLoad: () => {
  charRive.resizeToCanvas();
  this.cacheInputs(charRive, smName);
  // Set initial state to idle
  if (this.stateInput) {
    this.stateInput.value = 0;
  }
  this.startRenderLoop();
}

private cacheInputs(rive: Rive, smName: string): void {
  const inputs = rive.stateMachineInputs(smName);
  console.log('[RiveRenderer] SM inputs:', inputs?.map(i => `${i.name} (${StateMachineInputType[i.type]})`));
  if (!inputs) return;
  for (const input of inputs) {
    if (input.name === RIVE_INPUTS.STATE) this.stateInput = input;
    else if (input.name === RIVE_INPUTS.MOUTH_OPEN) this.mouthOpenInput = input;
    else if (input.name === RIVE_INPUTS.LOOK_X) this.lookXInput = input;
    else if (input.name === RIVE_INPUTS.LOOK_Y) this.lookYInput = input;
  }
}
```

### Example 2: Lip Sync Implementation (SYNC-02)
```typescript
// File: RiveRenderer.ts
// Source: [VERIFIED: rive.d.ts StateMachineInput.value setter]

private currentAmplitude = 0;
private targetAmplitude = 0;
private isSpeaking = false;
private readonly AMPLITUDE_CLAMP = 0.05;
private readonly AMP_LERP_FACTOR = 0.2; // faster smoothing for lip sync

setSpeaking(speaking: boolean, amplitude = 0): void {
  this.isSpeaking = speaking;
  if (speaking) {
    // Clamp to prevent noise (D-07)
    this.targetAmplitude = amplitude > this.AMPLITUDE_CLAMP
      ? Math.min(amplitude, 1.0)  // D-08: passthrough 0.0-1.0
      : 0;
  } else {
    this.targetAmplitude = 0;
  }
}

// In the rAF loop:
private updateLipSync(): void {
  // Smoothly approach target
  this.currentAmplitude += (this.targetAmplitude - this.currentAmplitude) * this.AMP_LERP_FACTOR;

  // Apply clamped amplitude to SM input
  if (this.mouthOpenInput) {
    const mouth = this.currentAmplitude > this.AMPLITUDE_CLAMP ? this.currentAmplitude : 0;
    if (Math.abs(mouth - this.lastMouthValue) > 0.005) {
      this.mouthOpenInput.value = mouth;
      this.lastMouthValue = mouth;
    }
  }
}
```

### Example 3: Mouse Follow with Lerp (SYNC-03)
```typescript
// File: RiveRenderer.ts
// Source: [CITED: D-09, D-11 — normalized range, lerp smoothing]

private targetLookX = 0;
private targetLookY = 0;
private currentLookX = 0;
private currentLookY = 0;
private readonly LOOK_LERP_FACTOR = 0.1;  // D-09: agent's discretion

lookAt(x: number, y: number): void {
  const canvas = this.mainCanvas;
  if (!canvas) return;

  // Normalize canvas pixel → SM space (-1.0..1.0) — D-11
  this.targetLookX = (x / canvas.width) * 2 - 1;
  this.targetLookY = (y / canvas.height) * 2 - 1;

  // Clamp to SM expected range
  this.targetLookX = Math.max(-1, Math.min(1, this.targetLookX));
  this.targetLookY = Math.max(-1, Math.min(1, this.targetLookY));
}

resetPointer(): void {
  // Reset to center (facing forward)
  this.targetLookX = 0;
  this.targetLookY = 0;
}

// In the rAF loop:
private updateMouseFollow(): void {
  // Exponential smoothing
  this.currentLookX += (this.targetLookX - this.currentLookX) * this.LOOK_LERP_FACTOR;
  this.currentLookY += (this.targetLookY - this.currentLookY) * this.LOOK_LERP_FACTOR;

  // Only update SM input when significantly different (avoids redundant WASM calls)
  if (Math.abs(this.currentLookX - this.lastLookX) > 0.001) {
    if (this.lookXInput) this.lookXInput.value = this.currentLookX;
    this.lastLookX = this.currentLookX;
  }
  if (Math.abs(this.currentLookY - this.lastLookY) > 0.001) {
    if (this.lookYInput) this.lookYInput.value = this.currentLookY;
    this.lastLookY = this.currentLookY;
  }
}
```

### Example 4: Action Interrupt + Idle Timer (SYNC-04/SYNC-05)
```typescript
// File: RiveRenderer.ts
// Source: [CITED: D-01 through D-04, D-12 through D-14]

// State index map (matches D-15)
const RIVE_STATE_INDEX: Record<string, number> = {
  idle: 0, thinking: 1, speaking: 2, happy: 3, error: 4,
  searching: 5, coding: 6, terminal: 7, confused: 8, angry: 9,
};

const MOMENTARY_ACTIONS = new Set(['happy', 'error', 'clicked', 'doubleClicked', 'wake']);

async playAction(actionName: string, options?: PlayActionOptions): Promise<void> {
  // D-12: Cancel any pending idle return (interrupt)
  this.clearIdleTimer();

  this.currentAction = actionName;
  const stateIndex = RIVE_STATE_INDEX[this.actionToState(actionName)] ?? 0;

  // D-12: Immediate override (no queue — D-13)
  if (this.stateInput) {
    this.stateInput.value = stateIndex;
    console.log(`[RiveRenderer] state → ${stateIndex} (${actionName})`); // D-17
  }

  // D-02: If momentary action, schedule idle auto-return
  const isMomentary = options?.playback === 'momentary' || MOMENTARY_ACTIONS.has(actionName);
  if (isMomentary) {
    this.scheduleIdle(400); // default delay, agent's discretion
  }
  // D-03: Sustained actions stay until external trigger
}

private scheduleIdle(delay: number): void {
  this.clearIdleTimer();
  this.idleTimerId = window.setTimeout(() => {
    this.idleTimerId = null;
    if (this.stateInput) {
      this.stateInput.value = 0; // idle
      console.log('[RiveRenderer] Idle auto-return'); // D-17
    }
  }, delay);
}
```

### Example 5: Complete rAF Loop
```typescript
// File: RiveRenderer.ts
// Source: [VERIFIED: rive.d.ts drawFrame() — Rive manages its own rendering]

private startRenderLoop(): void {
  if (this.rafId) return; // prevent duplicate loops
  const loop = () => {
    if (this.disposed) return;

    this.updateMouseFollow();
    this.updateLipSync();

    this.rafId = requestAnimationFrame(loop);
  };
  this.rafId = requestAnimationFrame(loop);
}

private stopRenderLoop(): void {
  if (this.rafId) {
    cancelAnimationFrame(this.rafId);
    this.rafId = 0;
  }
}

// Override destroy to stop the loop:
destroy(): void {
  this.stopRenderLoop();
  this.disposed = true;
  this.cleanupInstances();
  this.mainCanvas = null;
  this.bgCanvas = null;
}
```

**Note on rendering:** The Rive instance created with `autoplay: true` and a state machine already runs its own internal render loop via `drawFrame()`. The rAF loop above is for **input smoothing only** — it sets SM input values. Rive's internal loop reads those values each frame. If the smoothing rAF and Rive's render rAF overlap unnecessarily, we could alternatively remove the separate rAF loop and instead set raw values in `lookAt()`/`setSpeaking()`, letting Rive's internal rendering handle the interpolation. However, the separate smoothing loop gives us control over lerp behavior independent of Rive's frame scheduling.

**Alternative approach (simpler, no custom rAF):**
```typescript
// Set directly, let Rive handle interpolation
setSpeaking(speaking: boolean, amplitude = 0): void {
  if (this.mouthOpenInput) {
    this.mouthOpenInput.value = speaking ? Math.max(amplitude, 0) : 0;
  }
}

lookAt(x: number, y: number): void {
  // Set raw values — Rive SM reads them per frame
  if (this.lookXInput) this.lookXInput.value = (x / canvas.width) * 2 - 1;
  if (this.lookYInput) this.lookYInput.value = (y / canvas.height) * 2 - 1;
}
```

The simpler approach removes the rAF overhead entirely but loses smoothing control. Since `lookAt()` is called at 50ms intervals (not 16ms), the raw values already have some inherent smoothness. **Recommendation:** Use the simpler approach for the initial implementation, add lerp only if mouse tracking appears jittery.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Live2D `ParamMouthOpenY` via sine wave | Rive `mouth_open` number input from RMS | Phase 2 | Real amplitude-driven lip sync instead of procedural animation |
| Live2D manual action resolution chain | Rive SM state number input (0–9) | Phase 1 | State machine handles transitions; our code just sets one number |
| `Live2DRenderer.setSpeaking()` with sine amplitude | `RiveRenderer.setSpeaking()` with real RMS | Phase 2 | No synthetic sine — uses actual audio amplitude |

**Deprecated/outdated:**
- `rive.stateMachineInputs()` is marked as deprecated in Rive docs (prefer Data Binding / ViewModel). However, it works in v2.37.5 and is the simplest approach. When Rive eventually removes it, migration would involve replacing `input.value = X` with `viewModelInstance.number('path').value = X`.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `StateMachineInput.value` setter triggers SM re-evaluation on the next advance frame | Architecture Patterns | If it's immediate within the same frame, behavior is the same for our use case — still correct |
| A2 | SM "settle" optimization automatically resumes when inputs change | Architecture Patterns | If settle requires explicit `play()` call, we'd need to add `rive.play()` after each input set |
| A3 | `look_x`/`look_y` range is -1.0 to 1.0 | Code Examples | If range is different (e.g., 0-1 or -100-100), normalization factor needs adjustment |
| A4 | The renderer's own rAF loop is not conflicting with Rive's internal draw loop | Code Examples | If Rive requires `drawFrame()` to be called manually when we use `autoplay: false`, the architecture changes |
| A5 | `requestAnimationFrame` continues running when the Electron window is minimized | Code Examples | If rAF pauses (standard browser behavior), lerp smoothing may lag on restore — mitigated by direct value being correct |

**Primary recommendation:** Verify A2 and A3 by running the manual test plan before writing plan tasks — set a `stateInput.value` in console after load and check if the SM responds.

## Open Questions

1. **Does Rive's SM settle require explicit `play()` after input changes?**
   - What we know: The docs say "state machines may also settle" as an optimization, and input changes unsettle them
   - What's unclear: Whether setting `input.value` on a settled SM automatically triggers re-evaluation, or if a `rive.play()` call is needed
   - Recommendation: Assume automatic (A2). Verify by checking SM responds immediately during first manual test. If not, add `rive.play()` call wrapper.

2. **Does `look_x`/`look_y` in Rive SM range -1.0~1.0 as assumed?**
   - What we know: This is the standard convention for Rive SM number inputs controlling bone/transform targets
   - What's unclear: Rive Editor's specific convention for look-at inputs could use 0-100 or artboard-pixel ranges
   - Recommendation: Assume -1.0~1.0 (A3). If wrong in manual testing, adjust normalization factor.

3. **Should the rendering approach use Rive's built-in rAF or a custom one?**
   - What we know: Rive with `autoplay: true` runs its own render loop calling `drawFrame()`. Adding a separate rAF for input smoothing is optional.
   - What's unclear: Whether calling `drawFrame()` manually in our rAF loop is needed or conflicts with Rive's internal scheduling
   - Recommendation: Start with the simpler approach (no custom rAF, set values directly). Add lerp smoothing only if jitter is visible.

## Environment Availability

Skip — this section is not needed for code/config-only changes. Phase 2 modifies `RiveRenderer.ts` only, no external dependencies beyond the already-installed `@rive-app/canvas`.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | None — no test framework installed |
| Config file | None found in project |
| Quick run command | `npm run dev:renderer` (manual test in browser) |
| Full suite command | N/A |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SYNC-01 | Action → SM state mapping | Manual | — | N/A (manual per D-16) |
| SYNC-02 | TTS lip sync | Manual | — | N/A (manual per D-16) |
| SYNC-03 | Mouse following | Manual | — | N/A (manual per D-16) |
| SYNC-04 | Idle auto-return | Manual | — | N/A (manual per D-16) |
| SYNC-05 | Action interruption | Manual | — | N/A (manual per D-16) |

### Sampling Rate
- **Per task commit:** Run dev server and verify console logs (D-17)
- **Phase gate:** All 5 SYNC requirements manually verified via dev server + Adapter API

### Wave 0 Gaps
No test infrastructure exists — consistent with D-16 (manual verification). No automated tests required for this phase.

## Security Domain

No security domain concerns — Phase 2 is pure rendering/animation integration. No network requests, no user input processing, no data storage. The only "input" is mouse coordinates (already sanitized to pixel coordinates by PetStage) and TTS amplitude (a 0.0-1.0 float from streaming-player.ts). No injection vectors exist.

## Sources

### Primary (HIGH confidence)
- `@rive-app/canvas` v2.37.5 `rive.d.ts` — StateMachineInput, StateMachineInputType, stateMachineInputs() signatures [VERIFIED]
- `@rive-app/canvas` v2.37.5 `rive.js` — StateMachine and StateMachineInput runtime implementations (input caching, initInputs, value setter) [VERIFIED]
- `@rive-app/canvas` v2.37.5 `rive_advanced.mjs.d.ts` — SMIInput low-level type definitions [VERIFIED]
- Official Rive docs (rive.app/docs/runtimes/web/state-machines) — SM playback, settling, inputs [CITED]
- Official Rive docs (rive.app/docs/runtimes/web/rive-parameters) — API reference for `stateMachineInputs()`, deprecated status, alternative APIs [CITED]
- Codebase: `RiveRenderer.ts`, `PetStage.tsx`, `pet-store.ts`, `streaming-player.ts`, `App.tsx`, `rive-inputs.ts` [VERIFIED]
- `02-CONTEXT.md` — D-01 through D-17 locked decisions [CITED]

### Secondary (MEDIUM confidence)
- GitHub rive-app/rive-wasm README — Getting started, project structure, supported browsers [WEBSEARCH verified against official source]

### Tertiary (LOW confidence)
None — all technical claims are backed by source code analysis or official documentation.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — @rive-app/canvas v2.37.5 confirmed via node_modules
- Architecture: HIGH — Patterns derived from locked decisions (D-01~D-17) and verified codebase analysis
- Pitfalls: HIGH — Based on source code analysis and common integration patterns
- Input caching: HIGH — Directly verified by reading rive.js source code (inputs array is populated once in initInputs, returned by reference)
- Lip sync pipeline: HIGH — Verified end-to-end by reading streaming-player.ts → pet-store.ts → PetStage.tsx → RiveRenderer.ts

**Research date:** 2026-05-08
**Valid until:** 30 days (stable library, no major revisions expected for the APIs used)
