---
phase: 03-http-adapter
plan: 01
type: execute
completed: true
wave: 3
started: 2026-05-10T08:00:08Z
duration: 12m
requirements: [ADP-01, ADP-02]
tasks_completed: 9/9
files_created:
  - apps/desktop/src-tauri/src/adapter/mod.rs
  - apps/desktop/src-tauri/src/adapter/routes.rs
  - apps/desktop/src-tauri/src/adapter/events.rs
  - apps/desktop/src-tauri/src/adapter/lifecycle.rs
files_modified:
  - apps/desktop/src-tauri/Cargo.toml
  - apps/desktop/src-tauri/src/lib.rs
  - apps/desktop/src-tauri/src/state.rs
  - apps/desktop/src-tauri/src/error.rs
  - .planning/phases/03-http-adapter/03-01-PLAN.md
key_decisions:
  - Use tokio::sync::Notify instead of tokio_util::CancellationToken (tokio-util lacks "sync" feature)
  - Split lib.rs from .run() convenience to .build().run() pattern for RunEvent::Exit handling
  - Port normalize.ts + policy.ts normalization logic to Rust for backward compatibility
---

# Phase 3 Plan 01: HTTP Adapter Summary

**Embedded axum HTTP server on port 18765 with graceful shutdown, event normalization, and WebView event emission.**

The adapter module replaces the Electron HTTP adapter (port 18765, two endpoints) with a Rust axum
server running on Tauri's shared Tokio runtime. External agents POST events to `/adapter` and the
server normalizes + forwards them to the Tauri WebView as `pet:event` events.

## Architecture

```
src-tauri/src/adapter/
├── mod.rs        — Module root, start_server(), build_router()
├── routes.rs     — Axum handlers (POST /adapter, GET /adapter/capabilities, OPTIONS/404)
├── events.rs     — Event types (AgentEvent, PetStateEvent, AdapterCapabilities), normalize, policy
└── lifecycle.rs  — AdapterLifecycle: tokio::sync::Notify based graceful shutdown
```

**Lifecycle flow:**
1. `setup()`: Create AdapterLifecycle, spawn axum on Tauri's Tokio runtime
2. Runtime: Axum handles requests, normalizes events, emits to WebView
3. Exit: `RunEvent::Exit` handler cancels Notify → axum::serve.with_graceful_shutdown completes

## Event Pipeline

```
curl POST /adapter → normalize_agent_event() → to_pet_state_event() → app_handle.emit("pet:event", payload)
```

The normalize/policy pipeline is ported from the Electron adapter's `normalize.ts + policy.ts`:
- Field alias normalization (agent|source, phase|type|event, kind|tool|tool_name, etc.)
- Phase alias mapping (snake_case → kebab-case, agent SDK names → canonical)
- Tool action → pet animation mapping (code → coding, search → searching, etc.)
- Momentary vs continuous mode with auto-reset durations

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Shutdown primitive | `tokio::sync::Notify` | tokio-util lacks "sync" feature; Notify is simpler and in core tokio |
| lib.rs pattern | `.build().run(event)` | Required for RunEvent::Exit lifecycle callback |
| CORS | Manual headers (no tower-http) | Minimal dependency — only 3 headers needed |
| Port config | `VIVIPET_ADAPTER_PORT` env var | Same as Electron convention, fallback to 18765 |
| State type | `Arc<Notify>` shared via axum State | AppHandle is cheaply clonable (Arc internally) |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug fix] tokio-util "sync" feature not available**
- **Found during:** Task 1 (dependency addition)
- **Issue:** `tokio-util` v0.7 does not have a `sync` feature. `CancellationToken` is not directly accessible.
- **Fix:** Replaced with `tokio::sync::Notify` — equivalent pattern using `notify_waiters()` + `notified().await`
- **Files modified:** `lifecycle.rs`, `mod.rs`, `lib.rs`, `Cargo.toml`

**2. [Rule 3 — Blocking fix] App::run() returns unit type, not Result**
- **Found during:** Build verification (Task 9)
- **Issue:** `tauri::App::run()` returns `()`, not `Result<(), Error>`. The `.expect("error while running")` in the original code was incorrect for the `.build().run()` pattern.
- **Fix:** Removed the final `.expect()` call after `.run()`.
- **Files modified:** `lib.rs`

**3. [Rule 3 — Blocking fix] State borrow lifetime with MutexGuard**
- **Found during:** Build verification (Task 9)
- **Issue:** The `if let Ok(guard) = state.lock()` pattern in the setup closure caused lifetime issues — the temporary `MutexGuard` outlived the `State<'_, ...>` reference.
- **Fix:** Bound the `state.lock()` result to a named variable with explicit `drop()`.
- **Files modified:** `lib.rs`

## Verification

| Check | Status |
|-------|--------|
| `cargo check` | ✅ Passes |
| Unit tests (9) | ✅ All pass |
| Build (macOS) | ✅ Compiles |
| Pre-existing warnings | ⚠️ 22 pre-existing (Phase 1/2 code) |

## File Summary

| File | Lines | Purpose |
|------|-------|---------|
| `adapter/mod.rs` | 95 | Module root, start_server, port resolution |
| `adapter/routes.rs` | 160 | Axum route handlers + CORS |
| `adapter/events.rs` | 742 | Event types, normalize, policy, 9 tests |
| `adapter/lifecycle.rs` | 55 | Notify-based graceful shutdown |
| `Cargo.toml` | +2 lines | axum 0.8, tokio sync feature |
| `lib.rs` | +35/-2 | Adapter wiring, build().run() pattern |
| `state.rs` | +5 | AdapterLifecycle field |
| `error.rs` | +2 | Adapter error variant |

## Connected Files

- `VERIFICATION.md` written to project root
- `REQUIREMENTS.md` — ADP-01 and ADP-02 changed to Complete
- `ROADMAP.md` — Phase 3 marked complete
- `STATE.md` — Position advanced to Phase 4

## Self-Check

- ✅ 4 adapter source files exist (`mod.rs`, `routes.rs`, `events.rs`, `lifecycle.rs`)
- ✅ PLAN.md and SUMMARY.md created
- ✅ VERIFICATION.md at project root
- ✅ STATE.md, ROADMAP.md, REQUIREMENTS.md updated
- ✅ 9 git commits present on `phase-03-http-adapter` branch
- ✅ `cargo check` passes (zero errors)
- ✅ 9 unit tests pass (adapter event types, normalize, policy)
- ✅ All file paths verified on disk
