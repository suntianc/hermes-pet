# Pitfalls: Electron → Tauri 2 + Rust Migration

## Critical (Blockers)

### P-01: Tauri capabilities/permissions model misunderstanding
**Warning:** Treating Tauri like Electron's contextBridge and allowing broad permissions
**Prevention:** Design capabilities granularly from day 1 — per-window, per-command. Use Tauri 2's capability files in `src-tauri/capabilities/`
**Phase:** 1 (Foundation)
**Severity:** Blocker

### P-02: Axum lifecycle not tied to Tauri shutdown
**Warning:** HTTP server continues running after app quit, or crashes on shutdown
**Prevention:** Use `tauri::async_runtime::spawn()` with a `CancellationToken` triggered by `on_event(RunEvent::Exit)` handler
**Phase:** 3 (Adapter)
**Severity:** Blocker

### P-03: Cross-platform TTS provider gaps
**Warning:** macOS works in dev but Windows SAPI/Linux speech-dispatcher untested until late in cycle
**Prevention:** Set up cross-platform CI in Phase 1. Test TTS on all 3 platforms during Phase 2 development, not after
**Phase:** 2 (TTS)
**Severity:** Blocker

## Major

### P-04: Rust async confusion for first-time Rust users
**Warning:** Mixing tokio::spawn, async/await, sync Mutex, and blocking I/O incorrectly
**Prevention:** Follow architecture doc's state management patterns. Use `std::sync::Mutex` (not tokio) for app state. Use `tokio::task::spawn_blocking` for heavy TTS processing
**Phase:** All
**Severity:** Major

### P-05: Audio format incompatibility between TTS providers and Web Audio API
**Warning:** Different TTS providers return different audio formats (PCM 16-bit, MP3, Opus). Web Audio API may not decode all
**Prevention:** Standardize on PCM 16-bit 44100Hz mono. Add format detection/transcoding in Rust before sending via Channel
**Phase:** 2 (TTS)
**Severity:** Major

### P-06: window.electronAPI → @tauri-apps/api refactoring surface area
**Warning:** Undertaking frontend IPC refactoring as a monolithic task, risking regressions
**Prevention:** Create an adapter layer (`src/tauri-adapter.ts`) that mirrors the old `electronAPI` interface. Migrate callers one-by-one. Test each migration
**Phase:** 6 (Frontend IPC)
**Severity:** Major

### P-07: Live reload / dev workflow differences
**Warning:** Expecting Electron's HMR parity. Tauri requires Rust compilation on every backend change
**Prevention:** Separate frontend dev (Vite HMR) from backend dev. Use `tauri dev` for integration testing, `npm run dev:renderer` for frontend-only work. Accept 2-5s Rust compile times
**Phase:** 1 (Foundation)
**Severity:** Major

## Minor

### P-08: Tray icon cross-platform behavior
**Warning:** Linux tray (libayatana-appindicator) may have limited event support. macOS tray lacks some Windows features
**Prevention:** Test tray menus on each platform early. Keep tray interactions simple (click → menu, no click-count or position-dependent behavior)
**Phase:** 4 (Tray)
**Severity:** Minor

### P-09: Window positioning across multi-monitor setups
**Warning:** Bottom-right anchoring logic may break with multi-monitor or resolution changes
**Prevention:** Use `tauri-plugin-positioner` for initial positioning. Listen to `tauri://resize` and `tauri://move` events for re-anchoring
**Phase:** 1 (Foundation)
**Severity:** Minor

### P-10: File dialog / model import path differences
**Warning:** macOS uses `.app` bundle paths, Linux uses flatpak/snap sandbox paths. Hardcoded paths break
**Prevention:** Always use `tauri-plugin-dialog` + `tauri-plugin-fs` for path resolution. Never hardcode paths
**Phase:** 5 (Model Management)
**Severity:** Minor

### P-11: Auto-update UI removed in Tauri v2
**Warning:** Tauri v2 removed the built-in update dialog. Expecting users to see update prompts without custom UI
**Prevention:** Build a simple update notification in React frontend (listens to updater events)
**Phase:** 7 (Distribution)
**Severity:** Minor

### P-12: Over-engineering the first Rust iteration
**Warning:** Trying to write idiomatic/perfect Rust on first pass, slowing migration
**Prevention:** Accept "working Rust" over "beautiful Rust" for initial migration. Use `unwrap()` liberally in early phases, add proper error handling in post-migration cleanup
**Phase:** All
**Severity:** Minor
