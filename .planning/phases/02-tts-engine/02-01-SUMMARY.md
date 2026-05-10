---
phase: 02-tts-engine
plan: 01
type: execute
subsystem: tts-engine
tags: [tts, foundation, config, queue, provider-trait]
requires: []
provides: [tts-config-types, tts-text-splitting, tts-queue, tts-provider-trait]
affects: [src-tauri-module-tree]
tech-stack:
  added: [async-trait 0.1, chrono 0.4]
  patterns: [async-trait-for-providers, serde-tagged-enums]
key-files:
  created:
    - apps/desktop/src-tauri/src/tts/config.rs
    - apps/desktop/src-tauri/src/tts/queue.rs
    - apps/desktop/src-tauri/src/tts/providers/mod.rs
    - apps/desktop/src-tauri/src/tts/mod.rs
  modified:
    - apps/desktop/src-tauri/src/lib.rs
    - apps/desktop/src-tauri/Cargo.toml
decisions:
  - TTSSpeakOptions uses #[serde(tag = "model")] matching Electron JSON structure
  - TTSPlayState uses #[serde(tag = "status")] matching Electron frontend
  - Text splitting implements sentence→comma→hard split without regex dependency
  - TtsProvider trait is async with async-trait crate
  - stream module left commented out (will be activated in Plan 02)
metrics:
  duration: ~8 min
  completed_date: 2026-05-10
---

# Phase 2 Plan 1: TTS Foundation Summary

Foundation layer for the TTS engine: config types with serde persistence, text-splitting FIFO queue, and the TtsProvider async trait.

## Completed

- **config.rs**: TTSConfig, TTSSpeakOptions, TTSProviderType, TTSPlayState, AudioFormat, SystemTTSConfig, LocalTTSConfig, CloudTTSConfig — all with serde Serialize/Deserialize
- **queue.rs**: split_text() (sentence→comma→hard), validate_text(), TtsQueue FIFO with VecDeque
- **providers/mod.rs**: TtsProvider async trait, AudioChunk struct, TtsStreamResult type alias
- **tts/mod.rs**: Module root with re-exports (stream module commented out)
- **lib.rs**: Added `mod tts;` declaration
- **Cargo.toml**: Added chrono (0.4, serde feature), async-trait (0.1)
- **8 unit tests** for queue/text splitting: all pass

## Deviations

None — plan executed exactly as written.

## Testing

```bash
cargo test -p vivi-pet -- tts::queue
# Result: 8 passed, 0 failed
```
