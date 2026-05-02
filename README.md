# HermesDeskPet

A self-evolving desktop pet powered by Hermes Agent.

## Tech Stack

- **Electron** - Desktop window management
- **React + TypeScript** - UI rendering
- **Live2D Cubism SDK** - Character animation via pixi-live2d-display
- **EventSource (SSE)** - Direct Hermes Gateway communication

## Features

- Transparent, always-on-top desktop pet window
- Live2D character with multiple animations
- Hermes Agent event-driven reactions (direct SSE connection)
- Action DSL for custom behaviors
- System tray integration
- Mouse passthrough mode

## Prerequisites

1. **Hermes Agent CLI** running with gateway on port 8642
   ```bash
   hermes gateway run
   # or
   hermes gateway start
   ```

2. **Live2D Model** - Download from Live2D Cubism SDK or create your own

## Quick Start

```bash
cd hermes-deskpet/apps/desktop
npm install
npm run build
npm start
```

## Hermes Gateway Connection

HermesDeskPet connects **directly** to Hermes Gateway via SSE (Server-Sent Events):

```
HermesDeskPet ────────── SSE ──────────> Hermes Gateway (:8642)
```

**Endpoints used:**
- `POST /v1/runs` - Create a run
- `GET /v1/runs/{runId}/events` - SSE event stream

**Authentication:** Uses `API_SERVER_KEY` from profile's `.env` file.

## Adding a Live2D Model

1. Download Live2D Cubism SDK from https://www.live2d.com/cubism-sdk/download/
2. Get a model file (`.model3.json`) and texture files
3. Place the model folder in `apps/desktop/assets/models/your-model/`
4. Add an entry to `apps/desktop/assets/models/models.json`:
   ```json
   {
     "id": "your-model",
     "name": "Your Model",
     "path": "./models/your-model/your-model.model3.json",
     "window": { "width": 520, "height": 760 },
     "canvas": { "width": 520, "height": 760 },
     "offset": { "x": 0, "y": 0 },
     "padding": 24,
     "scale": 0.9
   }
   ```
5. Tune `window`, `canvas`, `offset`, `padding`, and `scale` if the model is clipped or too small.
6. Restart the desktop app. The model will appear in the right-click model switcher.

## Hermes Events → Pet Actions

| Gateway SSE Event | Pet Action |
|------------------|------------|
| `run.started` | idle |
| `reasoning.delta` / `thinking.delta` | thinking |
| `message.delta` | speaking |
| `tool.started` | coding/searching/reading/terminal |
| `tool.completed` | happy / confused |
| `run.completed` | task_done |
| `run.failed` | error |

## Architecture

```
┌────────────────────────────────────┐
│        HermesDeskPet                  │
│   EventSource (SSE) Client          │
└───────────────┬────────────────────┘
                │ SSE
                ▼
┌────────────────────────────────────┐
│      Hermes Gateway (:8642)         │
│  POST /v1/runs                     │
│  GET  /v1/runs/{id}/events        │
└───────────────┬────────────────────┘
                │
                ▼
┌────────────────────────────────────┐
│        Hermes Agent                  │
└────────────────────────────────────┘
```

## License

MIT
