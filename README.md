# ViviPet

A universal AI-driven desktop companion that brings Live2D characters to life.
External agents control the character through a simple action API — triggering expressions, motions, speech bubbles, and eventually TTS — turning every notification into an expressive, visual moment.

## Tech Stack

- **Electron** — Desktop window management
- **React + TypeScript** — UI rendering
- **Live2D Cubism SDK (Cubism 5)** — Character animation
- **EventSource (SSE)** — Real-time agent communication

## Features

- Transparent, always-on-top desktop pet window
- Live2D character with rich expressions and motions
- Agent-driven reactions via SSE or HTTP API
- System tray integration
- Mouse passthrough mode

## Quick Start

```bash
cd apps/desktop
npm install
npm run dev      # development mode
```

Or for production:

```bash
npm run build
npm start
```

## Action API

External agents interact with ViviPet by dispatching actions — whether through the built-in SSE client, the event bridge, or directly calling the exposed API.

| Action      | Effect                     |
|-------------|----------------------------|
| `idle`      | Default idle animation     |
| `thinking`  | Starry eyes expression     |
| `speaking`  | Blush expression + bubble  |
| `happy`     | Heart eyes expression      |
| `success`   | Starry eyes expression     |
| `error`     | Dark face expression       |
| `confused`  | White eyes expression      |
| `angry`     | Angry expression           |
| `searching` | Starry eyes                |
| `reading`   | Right hand pose            |
| `coding`    | Left hand pose             |
| `terminal`  | White eyes expression      |

## Adding a Live2D Model

1. Obtain a Live2D Cubism model (`.model3.json`, `.moc3`, textures, physics, motions)
2. Place the model folder in `public/Resources/your-model/`
3. Add an entry to `public/assets/models/models.json`:
   ```json
   {
     "id": "your-model",
     "name": "Your Model",
     "path": "/Resources/your-model/your-model.model3.json",
     "window": { "width": 520, "height": 760 },
     "canvas": { "width": 520, "height": 760 }
   }
   ```
4. Restart the app. The model will appear in the right-click model switcher.

## Architecture

```
┌──────────────────────────────┐
│        ViviPet               │
│  Live2D Renderer             │
│  Action Dispatcher           │
│  SSE / IPC / Bridge Client   │
└──────────┬───────────────────┘
           │ actions (motion, expression, bubble, …)
           ▼
┌──────────────────────────────┐
│     External Agent           │
│  (Hermes, Copilot, custom)   │
└──────────────────────────────┘
```

ViviPet exposes an action dispatch system that can be triggered via:
- **SSE** — Connect directly to any event stream
- **Event Bridge** — HTTP endpoint on port `18765` (`POST /event`)
- **IPC** — From Electron main process
- **API** — Exposed action interface for programmatic control

## License

MIT
