---
phase: 02-tts-engine
plan: 03
type: execute
subsystem: tts-engine
tags: [tts, commands, wiring, tauri-plugin-store, Channel]
requires: [02-plan]
provides: [tts-commands, tts-manager, config-persistence, abort-mechanism]
affects: [app-state, error-enum, tauri-commands-registry]
tech-stack:
  added: [tauri-plugin-store 2]
  patterns: [Mutex-managed-state for TTS config, Arc-AtomicBool for abort signaling]
key-files:
  created:
    - apps/desktop/src-tauri/src/commands/tts.rs
  modified:
    - apps/desktop/src-tauri/src/tts/mod.rs
    - apps/desktop/src-tauri/src/commands/mod.rs
    - apps/desktop/src-tauri/src/state.rs
    - apps/desktop/src-tauri/src/error.rs
    - apps/desktop/src-tauri/src/lib.rs
    - apps/desktop/src-tauri/Cargo.toml
    - apps/desktop/src-tauri/capabilities/default.json
decisions:
  - AppState wrapped in Mutex (managed as Mutex<AppState>) with tts_config + tts_manager fields
  - Abort uses Arc<AtomicBool> shared between AppState manager and spawned background tasks
  - TTS config persisted via tauri-plugin-store, loaded on startup in setup() hook
  - Background tasks use with_abort_flag() to share the abort flag from AppState
  - State broadcasts (playing, idle, error, stopped) via app.emit("tts:state")
  - Audio streaming via Channel<TtsStreamEvent> (typed, ordered, binary-capable)
metrics:
  duration: ~15 min
  completed_date: 2026-05-10
---

# Phase 2 Plan 3: TtsManager + Tauri Commands + Wiring Summary

Connected all TTS pieces into working Tauri commands with Channel streaming, abort mechanism, and config persistence.

## Completed

- **tts/mod.rs**: TtsManager with process_request (split→synthesize→Channel), stop(Arc<AtomicBool>), with_abort_flag
- **commands/tts.rs**: 5 Tauri commands — tts_speak (async, Channel), tts_stop, tts_get_config, tts_set_config, tts_get_voices
- **commands/mod.rs**: Added `pub mod tts;`
- **state.rs**: AppState with tts_config (TTSConfig) + tts_manager (TtsManager)
- **error.rs**: Added Tts and Config error variants
- **lib.rs**: tts module, tauri-plugin-store, load_tts_config, 5 TTS commands registered
- **capabilities/default.json**: Added store:default permission
- **Cargo.toml**: Added tauri-plugin-store

## Deviations

**Rule 2 — Critical fix:** Fixed abort flag propagation. The original design created a fresh `TtsManager` (with new `AtomicBool`) in the spawned background task, but `tts_stop` sets the abort on the AppState's manager. Added `TtsManager::with_abort_flag()` to share the same `Arc<AtomicBool>` between the AppState manager and spawned tasks.

## Build Verification

```bash
cargo build
# Finished dev profile — no errors, only expected unused-code warnings
```
