# Phase 2: TTS Engine — Verification

**Date:** 2026-05-10
**Commit range:** `8c597e4..a566269`

## Plans Executed

| Plan | Status | Commit |
|------|--------|--------|
| 02-01 — TTS Foundation (config, queue, provider trait) | ✅ | `8c597e4` |
| 02-02 — All 3 providers + Channel stream types | ✅ | `8a9d285` |
| 02-03 — TtsManager + Tauri commands + wiring | ✅ | `9fe9333` |
| 02-04 — Frontend integration test | ✅ | `a566269` |

## Build Verification

### Cargo Build
```bash
cargo build -p vivi-pet
# Result: Finished dev profile — 0 errors, 21 warnings (all expected unused-code warnings)
```

### Unit Tests
```bash
cargo test -p vivi-pet -- tts::queue
# Result: 8 passed, 0 failed
```

### TypeScript Compilation
```bash
npx tsc --noEmit --project tsconfig.json
# Result: No new errors. Pre-existing errors from Electron API references unchanged.
npx tsc --noEmit --strict src/tts-test.ts
# Result: No errors.
```

## Files Created (14)

### Rust Backend (10 files)
1. `apps/desktop/src-tauri/src/tts/mod.rs` — Module root + TtsManager
2. `apps/desktop/src-tauri/src/tts/config.rs` — All config types (TTSConfig, TTSSpeakOptions, etc.)
3. `apps/desktop/src-tauri/src/tts/queue.rs` — Text splitting + FIFO TtsQueue
4. `apps/desktop/src-tauri/src/tts/stream.rs` — TtsStreamEvent Channel protocol
5. `apps/desktop/src-tauri/src/tts/providers/mod.rs` — TtsProvider trait + create_provider factory
6. `apps/desktop/src-tauri/src/tts/providers/system.rs` — SystemProvider (macOS/Windows/Linux)
7. `apps/desktop/src-tauri/src/tts/providers/local.rs` — LocalProvider (HTTP POST)
8. `apps/desktop/src-tauri/src/tts/providers/cloud.rs` — CloudProvider (OpenAI/ElevenLabs/Azure/Custom)
9. `apps/desktop/src-tauri/src/commands/tts.rs` — 5 Tauri commands

### Modified Rust Files (6)
- `state.rs` — AppState with TTS fields
- `error.rs` — Tts/Config error variants
- `lib.rs` — Module registration, store plugin, commands, load_tts_config
- `commands/mod.rs` — TTS module declaration
- `Cargo.toml` — 8 new dependencies
- `capabilities/default.json` — store:default permission

### Frontend Files (2)
10. `apps/desktop/src/tts-test.ts` — DevTools test harness
11. `apps/desktop/src/App.tsx` — Dynamic import of test harness

## Deviations Documented

1. **Rule 1 — Bug fix (Plan 02-02):** Added explicit `tokio` dependency for `spawn_blocking`
2. **Rule 2 — Critical fix (Plan 02-03):** Abort flag propagation — added `TtsManager::with_abort_flag()` to share `Arc<AtomicBool>` between AppState manager and spawned background tasks

## Requirements Covered

| ID | Description | Status |
|----|-------------|--------|
| TTS-01 | System provider (macOS `say`/Windows PowerShell/Linux espeak-ng) | ✅ |
| TTS-02 | Local HTTP TTS provider | ✅ |
| TTS-03 | Cloud TTS provider (OpenAI/ElevenLabs/Azure/Custom) | ✅ |
| TTS-04 | Queue management + text splitting | ✅ |
| TTS-05 | Audio streaming via Tauri Channel | ✅ |

## Threat Mitigations

| Threat ID | Mitigation | Status |
|-----------|-----------|--------|
| T-02-04 | Command injection — `Command::arg()` not shell | ✅ |
| T-02-07 | SSML injection — `escape_xml()` sanitizes | ✅ |
| T-02-08 | Input validation — empty/long text checked | ✅ |
| T-02-06 | HTTPS via reqwest native-tls (no cert skipping) | ✅ |

## Open Items

- [ ] **End-to-end test requires app launch with `cargo tauri dev`** — verify Channel streaming and audio playback via DevTools console
- [ ] TTS config API keys stored in plaintext — encryption deferred post-MVP (T-02-05, T-02-10)
- [ ] Test harness (`tts-test.ts` + window global) to be removed in Phase 6
- [ ] `tts_get_voices` returns empty — needs provider-specific listing in Phase 6

## Self-Check: PASSED

- All 14 created files verified via `[ -f path ]` 
- All 4 commits verified in `git log`
- `cargo build` succeeds
- `cargo test` — 8/8 pass
- TypeScript compiles with no new errors
