# Phase 6: Frontend IPC Migration — Verification Checklist

**Goal:** All frontend communication goes through `@tauri-apps/api`; zero Electron IPC remains.

## E2E Test Checklist

### Window Controls (via petWindow)

- [ ] **IPC-02-01**: Window ignores mouse events when `petWindow.setIgnoreMouseEvents(true)` is called
  - *Command:* `invoke('set_ignore_mouse_events', { ignore: true })`
- [ ] **IPC-02-02**: Window position is readable via `petWindow.getPosition()`
  - *Command:* `invoke('get_window_position')`
- [ ] **IPC-02-03**: Window resize works via `petWindow.setSize(width, height)`
  - *Command:* `invoke('set_window_size', { width, height })`
- [ ] **IPC-02-04**: Drag start works via `petWindow.beginDrag()`
  - *Command:* `invoke('begin_drag')`

### TTS (via petTTS)

- [ ] **IPC-02-05**: TTS speak invokes `tts_speak` command and creates Channel
  - *Command:* `invoke('tts_speak', { text, voice, onEvent: channel })`
  - *Channel receives:* `TtsStreamEvent { event: 'audio', data: [...], seq, sample_rate, isFinal }`
- [ ] **IPC-02-06**: TTS stop works via `petTTS.stop()`
  - *Command:* `invoke('tts_stop')`
- [ ] **IPC-02-07**: TTS config read/write via `petTTS.getConfig()` / `petTTS.setConfig(cfg)`
  - *Commands:* `invoke('tts_get_config')` / `invoke('tts_set_config', { config })`
- [ ] **IPC-02-08**: TTS voices list via `petTTS.getVoices(provider)`
  - *Command:* `invoke('tts_get_voices', { provider })`
- [ ] **IPC-02-09**: Audio chunks stream through StreamingAudioPlayer → Web Audio API → lip sync

### Model Management (via petModel)

- [ ] **IPC-02-10**: Model list works via `petModel.listModels()`
  - *Command:* `invoke('model_list')`
- [ ] **IPC-02-11**: Model import works via `petModel.importModel()`
  - *Command:* `invoke('model_import')`
- [ ] **IPC-02-12**: Model refresh scan via `petModel.refreshScan()`
  - *Command:* `invoke('model_refresh_scan')`
- [ ] **IPC-02-13**: Model remove via `petModel.removeModel(id)`
  - *Command:* `invoke('model_remove', { id })`

### AI Planner (via petAI)

- [ ] **IPC-02-14**: AI config read via `petAI.getConfig()`
  - *Command:* `invoke('ai_get_config')`
- [ ] **IPC-02-15**: AI config save via `petAI.setConfig(config)`
  - *Command:* `invoke('ai_set_config', { config })`
- [ ] **IPC-02-16**: AI plan generation via `petAI.plan(request)`
  - *Command:* `invoke('ai_plan', { request })`
- [ ] **IPC-02-17**: Connection test via `petAI.testConnection(config)`
  - *Command:* `invoke('ai_test_connection', { configOverride })`

### Tauri Events (via listen)

- [ ] **IPC-02-18**: Tray action events received via `listen('pet:action', ...)`
  - *Ref:* `onPetAction() in tauri-adapter.ts`
- [ ] **IPC-02-19**: HTTP Adapter events received via `listen('pet:event', ...)`
  - *Ref:* `onPetEvent() in tauri-adapter.ts`
- [ ] **IPC-02-20**: TTS state events received via `listen('tts:state', ...)`
  - *Ref:* `onTTSState() in tauri-adapter.ts`
- [ ] **IPC-02-21**: TTS config events received via `listen('tts:config', ...)`
  - *Ref:* `onTTSConfig() in tauri-adapter.ts`
- [ ] **IPC-02-22**: Model import events received via `listen('model:imported', ...)`
  - *Ref:* `onModelImported() in tauri-adapter.ts`

### Cleanup Verification

- [ ] **IPC-03-01**: `electron/preload.ts` deleted ✓
- [ ] **IPC-03-02**: `electron/ipc.ts` deleted ✓
- [ ] **IPC-03-03**: No `window.electronAPI` references in `src/` (confirmed: only comments) ✓
- [ ] **IPC-03-04**: `electron-log` removed from package.json ✓
- [ ] **IPC-03-05**: `electron` removed from devDependencies ✓
- [ ] **IPC-03-06**: `electron-builder` removed from devDependencies ✓
- [ ] **IPC-03-07**: `vite build` compiles with zero errors ✓

## Manual E2E Test

```bash
# Start the app
cd apps/desktop && cargo tauri dev

# Verify in browser DevTools console:
# 1. No 'electronAPI is not defined' errors
# 2. Tauri IPC bootstrap test passes (logged on startup)
# 3. Window appears with pet model
# 4. Click/drag pet to verify window interaction
# 5. Speak through TTS: run in DevTools console:
#    await __TAURI__.invoke('tts_speak', { text: 'Hello', voice: null, onEvent: new __TAURI__.Channel() })

# Adapter API test (app must be running):
curl -X POST http://localhost:18765/adapter \
  -H "Content-Type: application/json" \
  -d '{"agent":"manual","phase":"thinking"}'
# → Pet should show "thinking" animation
```

## Migration Summary

| File | Status | Notes |
|------|--------|-------|
| `src/tauri-adapter.ts` | ✓ Complete | Mirrors old `electronAPI`; uses invoke/listen/Channel |
| `src/tauri-types.ts` | ✓ Complete | Rust DTOs mirrored as TypeScript interfaces |
| `src/App.tsx` | ✓ Migrated | Uses petTTS, petWindow, petModel, petAI, onPetEvent, onPetAction |
| `src/components/PetStage.tsx` | ✓ Migrated | Uses petWindow.setIgnoreMouseEvents, getLastMousePosition |
| `src/components/SpeechBubble.tsx` | ✓ No IPC needed | Pure React component |
| `src/stores/pet-store.ts` | ✓ No IPC needed | Pure state management |
| `src/features/pet/model-registry.ts` | ✓ Migrated | Uses petModel.listModels() |
| `src/features/pet-events/behavior-planner.ts` | ✓ Migrated | Uses petAI.plan() |
| `src/audio/streaming-player.ts` | ✓ No change | Pure Web Audio API player |
| `src/main.tsx` | ✓ Migrated | Uses @tauri-apps/api/core for bootstrap test |
| `src/tts-test.ts` | ✓ Removed (Phase 6) | Replaced by production stream flow |
| `electron/preload.ts` | ✓ Removed (Phase 6) | Replaced by tauri-adapter.ts |
| `electron/ipc.ts` | ✓ Removed (Phase 6) | Replaced by Rust Tauri commands |
| `package.json` | ✓ Cleaned | electron, electron-log, electron-builder removed |
