# Integrations: Hermes DeskPet

> Last updated: 2026-05-08

## External APIs

### OpenAI API (AI Behavior Planner)
- **Package**: `openai` v6.36.0
- **Location**: `electron/ai-planner.ts`
- **Purpose**: Optional AI-driven pet behavior planning
- **Config**: Base URL, model, API key, timeout configurable via renderer settings panel
- **Provider-agnostic**: Uses OpenAI-API-compatible endpoints (e.g., local LLM servers like LM Studio at `http://localhost:1234/v1`)
- **Authorization**: Bearer token via `apiKey` field
- **Streaming**: Not used (non-streaming chat completions with tool calls)
- **Tool calling**: Uses OpenAI function calling (`pet_noop`, `pet_set_pose`, `pet_set_expression`, `pet_set_props`, `pet_say`)

### Cloud TTS APIs (Optional)
- **Provider support** in `electron/tts/streamers/cloud-streamer.ts`:
  - OpenAI TTS API
  - ElevenLabs TTS API
  - Azure Cognitive Services TTS
  - Custom API endpoints
- **Disabled by default** — requires user configuration

### Local TTS Service (Optional)
- **Location**: `electron/tts/streamers/local-streamer.ts`
- **Purpose**: HTTP streaming to a self-hosted local TTS service
- **Default endpoint**: `http://127.0.0.1:5000/tts`
- Three request modes: `preset` (Text+Voice+Model), `clone` (Text+Model), `instruct` (Text+Instruct+Model)

## Built-in Integrations

### System TTS (macOS)
- **Location**: `electron/tts/streamers/system-streamer.ts`
- **Mechanism**: Spawns `say` command via `child_process`
- **Voice listing**: `say -v '?'` command
- **Zero dependencies** — macOS built-in only

### HTTP Adapter (Agent Integration)
- **Port**: 18765 (configurable via `VIVIPET_BRIDGE_PORT` or `VIVIPET_ADAPTER_PORT`)
- **Protocol**: HTTP JSON API
- **Endpoints**:
  - `POST /adapter` — receive agent events (agent phase, text, TTS options)
  - `GET /adapter/capabilities` — discover supported phases and features
  - `GET /health` — health check
- **CORS**: Wildcard (`Access-Control-Allow-Origin: *`)
- **Purpose**: External agent hook integration — allows Hermes Agent or other CLI tools to send pet state events via curl
- **Event pipeline**: `POST /adapter` → `normalize.ts` (event normalization) → `policy.ts` (phase→action mapping) → IPC `pet:event` → renderer

### Custom Protocol: `vivipet-assets://`
- **Location**: `electron/model-manager.ts`
- **Purpose**: Serve user-imported model files from `userData/models/`
- **Registration**: `protocol.handle('vivipet-assets', ...)`
- **Security**: Path traversal protection via `resolveSafeUserModelPath()`

### Local SQLite Database
- **Location**: `electron/action-index.ts`
- **Database**: `{userData}/vivipet.sqlite`
- **Purpose**: Index model actions (motions + expressions) for fast lookup
- **API**: Node.js `node:sqlite` (DatabaseSync)
- **Tables**: `models`, `model_actions`
- **Relations**: One model → many actions (FK with CASCADE delete)

## External Events

### Adapter Event Schema
- **Agent phases**: `idle`, `thinking`, `speaking`, `tool:start`, `tool:success`, `tool:error`, `task:done`, `session:start`, `session:update`, `session:end`, `message`
- **Event aliases**: Multiple naming conventions normalized (snake_case, camelCase, prefixed names)
- **TTS control**: Per-event `tts` field (boolean or `{enabled, voice, model, instruct}`)
- **TTS fallback**: When TTS fails or disabled, falls back to speech bubble

### Renderer IPC Events
- `pet:event` — adapter events from main process
- `pet:action` — tray menu actions, direct actions
- `pet:tts:state` — TTS playback state (playing/idle/error/completed/stopped)
- `pet:tts:audioChunk` — streaming audio data (Uint8Array chunks)
- `pet:tts:config` — TTS configuration changes
