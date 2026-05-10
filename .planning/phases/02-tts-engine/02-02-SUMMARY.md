---
phase: 02-tts-engine
plan: 02
type: execute
subsystem: tts-engine
tags: [tts, providers, system, local, cloud, streaming]
requires: [01-plan]
provides: [system-provider, local-provider, cloud-provider, channel-stream-types]
affects: [src-tauri-module-tree]
tech-stack:
  added: [hound 3.5, reqwest 0.13, bytes 1, futures 0.3, base64 0.22, tokio 1]
  patterns: [cfg-target_os-for-platform-tts, spawn_blocking-for-blocking-io, serde-tag-for-channel-events]
key-files:
  created:
    - apps/desktop/src-tauri/src/tts/stream.rs
    - apps/desktop/src-tauri/src/tts/providers/system.rs
    - apps/desktop/src-tauri/src/tts/providers/local.rs
    - apps/desktop/src-tauri/src/tts/providers/cloud.rs
  modified:
    - apps/desktop/src-tauri/src/tts/providers/mod.rs
    - apps/desktop/src-tauri/src/tts/mod.rs
    - apps/desktop/src-tauri/Cargo.toml
decisions:
  - TtsStreamEvent uses #[serde(tag = "event")] — frontend receives { event: "audio", data: {...} }
  - System TTS: tokio::task::spawn_blocking for all blocking I/O (process, WAV file I/O)
  - macOS `say` produces native 16-bit 44100Hz WAV — hound reads and converts to PCM bytes
  - Cloud provider: OpenAI requests wav format, ElevenLabs returns MP3, Azure uses SSML
  - Local provider matches Electron capital-case body fields (Text, Voice, Model)
  - create_provider factory returns Option<Box<dyn TtsProvider>>
metrics:
  duration: ~12 min
  completed_date: 2026-05-10
---

# Phase 2 Plan 2: All 3 TTS Providers + Channel Stream Types Summary

Full implementation of all three TTS providers (system/local/cloud) and the TtsStreamEvent protocol for Channel-based audio streaming.

## Completed

- **stream.rs**: TtsStreamEvent enum (AudioChunk, Finished, Error) with serde tag, split_audio_chunks helper
- **providers/system.rs**: SystemProvider — macOS `say` → WAV → hound → PCM, Windows PowerShell SAPI, Linux espeak-ng
- **providers/local.rs**: LocalProvider — HTTP POST with capital-case body fields, content-type detection
- **providers/cloud.rs**: CloudProvider — OpenAI (WAV), ElevenLabs (MP3), Azure (SSML+MP3), Custom passthrough
- **providers/mod.rs**: Activated submodule declarations, added create_provider() factory
- **tts/mod.rs**: Activated stream module
- **Cargo.toml**: hound, reqwest (json+stream), bytes, futures, base64, tokio

## Deviations

**Rule 1 — Bug fix:** Added explicit `tokio` dependency. The system provider uses `tokio::task::spawn_blocking()` which requires the tokio crate to be in scope (it's implicitly available through Tauri but must be explicitly declared in Cargo.toml).

## Testing

All blocking I/O uses `spawn_blocking` as required by the architecture.
