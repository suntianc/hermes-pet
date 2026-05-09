# Research Synthesis: Milestone 2 — Electron → Tauri 2 + Rust Migration

**Project:** ViviPet / Hermes DeskPet
**Synthesized:** 2026-05-09
**Sources:** STACK.md, FEATURES.md, ARCHITECTURE.md, PITFALLS.md
**Overall Confidence:** HIGH

---

## Executive Summary

ViviPet is a desktop pet application (frameless pet window, system tray, TTS, AI behavior planner, HTTP agent adapter) currently built on Electron 41 + React 19 + Rive. Milestone 2 migrates **all backend logic** from Electron/Node.js (~15 files) to **Tauri 2 + Rust**, keeping the frontend rendering layer (React, Vite, Rive, Web Audio API) unchanged in the WebView. This is a well-trodden migration path — Tauri 2 has been stable since October 2024 (18+ months) with a mature plugin ecosystem.

The recommended stack is **axum 0.8** (embedded HTTP server on shared tokio runtime with Tauri) over actix-web, **reqwest 0.13** for OpenAI/cloud TTS APIs, and **Tauri Channels** for streaming TTS audio chunks to the WebView's Web Audio API — preserving the existing lip-sync pipeline without adding a Rust audio playback layer (no rodio/cpal). TTS audio flows from Rust providers → Channel → `StreamingAudioPlayer` (unchanged frontend code) → RMS amplitude → Rive mouth animation, maintaining the sub-200ms lip sync target.

**Key risks:** (1) Cross-platform TTS provider support (Windows SAPI/Linux espeak-ng untested without CI), (2) Axum lifecycle tied to Tauri shutdown (must use CancellationToken), (3) Frontend IPC refactoring surface area from `window.electronAPI` → `@tauri-apps/api` (use an adapter layer). **Build order matters:** Foundation (window + tray) → parallel TTS/Adapter/Model → AI Planner → Frontend IPC migration → Polish + Distribution.

---

## Key Findings

### From STACK.md — Technology Recommendations

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Desktop framework** | Tauri 2.11.1 + Rust 1.85+ | Stable since Oct 2024, mature plugin ecosystem, tray-icon in core |
| **HTTP server** | axum 0.8 (not actix-web) | Shared tokio runtime with Tauri; no runtime bridge needed |
| **HTTP client** | reqwest 0.13 (not ureq) | Async SSE streaming for OpenAI + cloud TTS providers |
| **Audio playback** | None in Rust (stream to WebView) | Preserves existing lip-sync pipeline; no rodio/cpal needed |
| **Audio decoding** | hound 3.5 (WAV only) | Read WAV from system TTS commands; symphonia overkill |
| **Logging** | tauri-plugin-log + tracing | Official plugin bridges Rust `log` to WebView console |
| **Config persistence** | tauri-plugin-store | Tauri-native, integrates with permission model |
| **File scanning** | walkdir 2.5 | Natural recursive directory traversal for .riv files |
| **Error handling** | thiserror 2 + anyhow 1 | thiserror for typed command errors (must impl Serialize); anyhow for internal setup |
| **State management** | `std::sync::Mutex<T>` via `app.manage()` | Tauri docs recommend; no Arc needed (State<T> wraps internally) |
| **TTS audio streaming** | Tauri `Channel<T>` (not emit/listen) | Ordered, binary-capable, designed for streaming data |
| **Update mechanism** | tauri-plugin-updater | Replaces electron-updater; signature verification is mandatory |
| **Single instance** | tauri-plugin-single-instance | Replaces `app.requestSingleInstanceLock()` |

**Key architectural decision — Audio stays in the WebView.** All TTS audio is streamed from Rust → WebView's Web Audio API. This preserves the existing `StreamingAudioPlayer` → RMS amplitude → Rive mouth_open input pipeline. Adding `rodio` or `cpal` in Rust would require a second audio output layer and cannot feed into the lip-sync pipeline.

**Frontend packages to remove:** `electron`, `electron-builder`, `electron-log`, `openai`.
**Frontend packages to add:** `@tauri-apps/api`, `@tauri-apps/plugin-log`, `@tauri-apps/plugin-updater`, `@tauri-apps/plugin-fs`, `@tauri-apps/plugin-dialog`, `@tauri-apps/plugin-process`.

### From FEATURES.md — Feature Landscape

**Table Stakes (must-have for migration):**

| ID | Feature | Complexity | Migrates From |
|----|---------|------------|---------------|
| TS-1 | Frameless/transparent/always-on-top window | Low | `electron/window.ts` |
| TS-2 | System tray with dynamic menu | Low-Med | `electron/tray.ts` |
| TS-3 | Tauri commands + events IPC bridge | Medium | `electron/preload.ts` + `electron/ipc.ts` |
| TS-4 | 3-provider TTS audio engine (system/local/cloud) | High | `electron/tts/` |
| TS-5 | HTTP adapter on port 18765 (axum) | High | `electron/adapter/` |
| TS-6 | File dialog + model import workflow | Low | `electron/model-manager.ts` |
| TS-7 | AI planner (OpenAI API via Rust reqwest) | Medium | `electron/ai-planner.ts` |
| TS-8 | Logging (tracing + tauri-plugin-log) | Low | `electron-log` |
| TS-9 | Auto-update | Medium | `electron-updater` |
| TS-10 | Cross-platform CI/CD | Medium | Current GitHub Actions |
| TS-11 | Key-value store for persistent config | Low | Manual JSON I/O |
| TS-12 | Single instance lock | Low | `app.requestSingleInstanceLock()` |

**Differentiators (what makes migration worthwhile):**
- **Unified Rust backend** — no dual-language (Node.js + Rust), single binary, no Electron/Chromium overhead
- **Memory footprint reduction** — ~70-80% less background RAM (5-15MB Rust vs 100-150MB Electron)
- **Startup time** — 2-3x faster from native binary
- **Bundle size** — ~90% reduction vs Electron + Chromium (~5MB + assets)
- **Granular security model** — capabilities-based permission system replaces contextBridge
- **Streaming audio via Channels** — more efficient than Electron's unstructured IPC for binary data
- **Axum HTTP server in-process** — no child process, no PM2, direct access to Tauri state/events

**Anti-Features (NOT porting):**
- Preload script / contextBridge (replaced by capabilities system)
- Node.js child processes (everything is Rust now)
- electron-builder (replaced by Tauri bundler)
- `app.getPath()` API (replaced by `BaseDirectory` enum)

### From ARCHITECTURE.md — System Architecture

**Two-process model (simpler than Electron's 3-process):**

```
┌──────────────────────────────────────────────────────┐
│                  WebView (Frontend)                    │
│  React 19 + Rive + StreamingAudioPlayer (unchanged)   │
│                         │                              │
│           @tauri-apps/api Layer                        │
│  invoke()  |  Channel  |  listen()  |  emit()         │
├─────────────────────────┼─────────────────────────────┤
│                  Core Process (Rust)                    │
│                         │                              │
│  ┌────────────┬─────────┴──────────┬───────────────┐  │
│  │ commands/  │  tts/   adapter/   │ tray/ window/ │  │
│  │ (dispatch) │  ai_planner/       │ model_manager/│  │
│  └────────────┴────────────────────┴───────────────┘  │
│                         │                              │
│              AppState (Mutex<T>)                       │
└────────────────────────────────────────────────────────┘

External agent (curl) ──► Adapter (axum:18765) ──emit──► WebView
```

**IPC Decision Matrix:**

| Mechanism | Use Case | Binary? | Ordered? | Throughput |
|-----------|----------|---------|----------|------------|
| `invoke()` | Request-response (queries, mutations) | Yes (Response<T>) | N/A | Low-Med |
| `Channel<T>` | Streaming audio, progress | Yes (Vec<u8>) | ✅ Guaranteed | High |
| `emit()`/`listen()` | Push events (state changes) | No (JSON only) | ❌ | Low-Med |

**Module layout (src-tauri/src/):**

```
├── main.rs              → Entry point (calls lib::run())
├── lib.rs               → Tauri builder, plugin registration, setup()
├── commands/            → #[tauri::command] dispatch layer
│   ├── tts.rs           → tts_speak, tts_stop, tts_get_config
│   ├── window.rs        → window_resize, window_drag
│   ├── model.rs         → model_list, model_import
│   ├── adapter.rs       → adapter_get_status
│   └── ai.rs            → ai_plan
├── tts/                 → TTS engine (manager, config, system/local/cloud providers)
├── adapter/             → Axum HTTP server (server, protocol, normalize, policy)
├── ai_planner/          → OpenAI client + behavior policy
├── model_manager/       → Registry, scanner, importer, protocol
├── tray/                → TrayIconBuilder + menu handlers
├── window/              → Window creation + positioning
├── state.rs             → AppState struct (all Mutex-protected)
├── error.rs             → AppError enum (thiserror + Serialize)
└── logging.rs           → tracing-subscriber setup
```

**State management:** Single `AppState` struct with `std::sync::Mutex<T>` for each domain. Registered via `app.manage()`. Accessed in commands via `State<'_, Mutex<T>>`. No `Arc` needed — `State<T>` wraps internally.

### From PITFALLS.md — Critical Risks

| ID | Risk | Severity | Phase | Mitigation |
|----|------|----------|-------|------------|
| **P-01** | Permissions misunderstanding (treating Tauri like Electron's contextBridge) | 🔴 Blocker | 1 | Design capabilities granularly from day 1; use `capabilities/default.json` |
| **P-02** | Axum lifecycle not tied to Tauri shutdown | 🔴 Blocker | 3 | Use `CancellationToken` triggered by `RunEvent::Exit` |
| **P-03** | Cross-platform TTS gaps (Windows/Linux untested) | 🔴 Blocker | 2 | Set up cross-platform CI in Phase 1; test TTS on all platforms during Phase 2 |
| **P-04** | Rust async confusion (mix of sync/async/blocking patterns) | 🟠 Major | All | Follow architecture doc patterns: `std::sync::Mutex` for state, `spawn_blocking` for heavy work |
| **P-05** | Audio format incompatibility between TTS providers and Web Audio API | 🟠 Major | 2 | Standardize on PCM 16-bit 44.1kHz mono; add format detection in Rust before Channel send |
| **P-06** | Monolithic frontend IPC refactoring | 🟠 Major | 6 | Create `src/tauri-adapter.ts` adapter layer; migrate callers one-by-one |
| **P-07** | Dev workflow differences (Rust compile times) | 🟠 Major | 1 | Separate frontend dev (Vite HMR) from backend dev; accept 2-5s Rust compile times |
| **P-11** | Auto-update UI removed in Tauri v2 | ⚪ Minor | 7 | Build custom update notification in React frontend |

---

## Implications for Roadmap

### Phase Ordering Recommendation

```
Phase 1: Foundation (no external deps)
├── P-01, P-07, P-09 addressed here
├── Tauri project scaffold (Cargo.toml, tauri.conf.json, capabilities/)
├── Window: frameless + transparent + always-on-top + bottom-right anchor
├── Single instance lock
├── Tray icon + basic menu structure
├── Logging setup (tracing + tauri-plugin-log)
├── CI/CD pipeline (cross-platform build matrix)
└── DELIVERS: App launches, shows window, tray works, CI green

Phase 2: TTS Engine (depends on Phase 1 foundation)
├── P-03, P-05 addressed here (cross-platform TTS, audio format standardization)
├── TTS config persistence (tauri-plugin-store)
├── TTS manager (FIFO queue, text splitting)
├── System provider (macOS say, Windows SAPI, Linux espeak-ng)
├── Local provider (HTTP streaming via reqwest)
├── Cloud provider (OpenAI / ElevenLabs / Azure via reqwest)
├── Channel streaming to WebView (Vec<u8> chunks)
└── DELIVERS: TTS working on all platforms, streaming to audio player

Phase 3: HTTP Adapter (depends on Phase 1)
├── P-02 addressed here (CancellationToken lifecycle)
├── Axum server on port 18765
├── POST /adapter + GET /adapter/capabilities
├── Event normalization (agent → pet state)
├── Behavior policy (rule/ai/hybrid)
└── DELIVERS: External agents can control pet via port 18765

Phase 4: Model Management (depends on Phase 1)
├── P-10 addressed here (path resolution)
├── Model registry (built-in + user models)
├── walkdir-based .riv file scanning
├── File dialog import (.riv / .zip)
├── vivipet-assets:// custom protocol
└── DELIVERS: User can import/manage models

Phase 5: AI Planner (depends on Phase 4 — needs model registry)
├── OpenAI client via reqwest (replaces openai npm package)
├── Function calling support
├── Three modes: rule-based, AI-driven, hybrid
├── API key management
└── DELIVERS: AI-driven pet behavior

Phase 6: Frontend IPC Migration (depends on Phases 2–5)
├── P-06 addressed here (adapter layer)
├── Create src/tauri-adapter.ts mirroring electronAPI interface
├── Convert ALL invoke() calls one-by-one
├── Migrate ALL listen() event handlers
├── Remove preload.ts entirely
└── DELIVERS: Zero Electron dependencies remaining

Phase 7: Polish + Distribution (final)
├── P-11 addressed here (update UI)
├── Auto-update implementation (tauri-plugin-updater)
├── Update notification UI in React
├── Cross-platform testing (macOS arm64+x64, Windows, Linux)
├── Code signing (macOS + Windows)
├── Remove Electron devDependencies from package.json
└── DELIVERS: Production-ready Tauri app
```

### Dependency Graph

```
Phase 1: Foundation
  ├── Phase 2: TTS Engine (parallelizable with 3, 4)
  ├── Phase 3: HTTP Adapter (parallelizable with 2, 4)
  └── Phase 4: Model Management (parallelizable with 2, 3)
        └── Phase 5: AI Planner (needs 4)
              └── Phase 6: Frontend IPC Migration (needs 2, 3, 4, 5)
                    └── Phase 7: Polish + Distribution
```

**Parallel execution strategy:** Phases 2–4 can be built in parallel by different developers since they have no interdependencies. Each depends only on Phase 1 being complete.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| **Tauri 2 + Plugin Ecosystem** | HIGH | Verified against crates.io (v2.11.1) and official docs at v2.tauri.app |
| **Axum Integration** | HIGH | Well-established pattern; same tokio runtime as Tauri |
| **IPC Architecture** | HIGH | invoke/Channel/emit patterns documented by official Tauri docs |
| **TTS Architecture** | HIGH | Preserves working lip-sync pipeline; Rust handles encoding/streaming only |
| **Frontend Migration Strategy** | HIGH | Incremental adapter pattern reduces regression risk |
| **Cross-Platform CI/CD** | HIGH | Official Tauri CI workflow template available |
| **Windows TTS (SAPI)** | MEDIUM | PowerShell SAPI path needs verification; edge-tts CLI as fallback |
| **Linux Tray Events** | MEDIUM | Linux tray has limited click event support; keep tray interactions simple |
| **Audio Format Negotiation** | MEDIUM | Different providers return different formats; PCM standardization plan exists but untested |

**Overall: HIGH** — This is a well-documented migration with clear patterns.

### Gaps

| Gap | Impact | Resolution |
|-----|--------|------------|
| Windows SAPI TTS via PowerShell — exact command syntax unverified | Could delay Windows TTS in Phase 2 | Test with `edge-tts` CLI as fallback; document in Phase 2 plan |
| Linux espeak-ng package availability on Ubuntu/Debian | Linux TTS dependent on package | Include in `apt-get` install step for CI; document in Phase 2 |
| Tauri Channel binary throughput ceiling (Uint8Array size limits) | Audio streaming performance | Test with 16KB chunks; buffer size tuning in Phase 2 |
| AppState synchronization when axum handler mutates state accessed from commands | Potential race condition | Mutex per-field design should handle this; verify in Phase 3 review |

---

## Sources

- [Tauri 2.0 Stable Release](https://tauri.app/blog/tauri-20/) — Oct 2, 2024
- [Tauri 2 Upgrade Guide](https://v2.tauri.app/start/migrate/from-tauri-1/) — Official migration reference
- [Tauri Architecture](https://v2.tauri.app/concept/architecture/) — Process model, security model
- [Tauri Calling Rust](https://v2.tauri.app/develop/calling-rust/) — Command patterns
- [Tauri Calling Frontend](https://v2.tauri.app/develop/calling-frontend/) — Events + Channels
- [Tauri State Management](https://v2.tauri.app/develop/state-management/) — Mutex/State patterns
- [Tauri System Tray](https://v2.tauri.app/learn/system-tray/) — TrayIconBuilder API
- [Tauri Window Customization](https://v2.tauri.app/learn/window-customization/) — Frameless/transparent windows
- [Tauri GitHub Pipeline](https://v2.tauri.app/distribute/pipelines/github/) — CI/CD reference
- [Tauri Capabilities](https://v2.tauri.app/security/capabilities/) — Permission system
- [Tauri Plugin Documentation](https://v2.tauri.app/plugin/) — All official plugins
- crates.io — Version verification for all crates (May 9, 2026)
