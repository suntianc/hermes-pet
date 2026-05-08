# Research: Rive Integration Features

> Generated: 2026-05-08

## Table Stakes (Must Have)

- **[RIVE-01]** Load and display `.riv` file on HTML canvas
- **[RIVE-02]** Play Rive State Machine animations
- **[RIVE-03]** Set State Machine inputs from code (triggers, numbers, booleans)
- **[RIVE-04]** Replace Live2D rendering pipeline in PetStage
- **[RIVE-05]** Load models from filesystem (both bundled and user-imported)
- **[RIVE-06]** Support idle animation loop

## Differentiators

- **[RIVE-07]** Rive State Machine manages all transitions inherently — no custom animation scheduling needed
- **[RIVE-08]** Listeners allow interactive behavior without JavaScript event handling
- **[RIVE-09]** Runtime asset swapping (replace images inside `.riv` at runtime)
- **[RIVE-10]** Audio events embedded in State Machine (for sound effects)

## Anti-Features (Deliberately NOT Building)

- **Data Binding / ViewModel** — Not needed for pet character; state machine inputs are sufficient
- **Rive scripting** — Not needed for this use case; all logic stays in TypeScript
- **Layout systems** — Not building responsive UI with Rive; pet character fills fixed canvas area
- **Multi-artboard switching** — Single pet character, single artboard

## Rive API Surface Required

### Loading
```typescript
import Rive from '@rive-app/canvas';

const rive = new Rive({
  src: '/models/pet.riv',     // or ArrayBuffer from fs
  artboard: 'main',
  stateMachine: 'State Machine 1',
  autoplay: true,
  canvas: htmlCanvasElement,
  onLoad: () => { /* ready */ },
});
```

### State Machine Control
```typescript
// Trigger input
rive.play('transition_trigger');

// Boolean input
rive.setInputState('State Machine 1', 'is_speaking', true);

// Number input  
rive.setInputState('State Machine 1', 'mouth_open', 0.5);

// Reset
rive.resetInputs();
```

### Animation Playback
```typescript
// Play specific animation directly (bypass state machine)
rive.play('animation_name');

// Stop/Queue
rive.stop('animation_name');
rive.play('idle', { isLooping: true });
```

### Lifecycle
```typescript
// Cleanup
rive.cleanup();

// Resize
rive.resizeToCanvas();
```
