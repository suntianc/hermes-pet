# Technology Stack — Milestone 2 (Electron → Tauri 2 + Rust)

**Project:** ViviPet / Hermes DeskPet
**Researched:** 2026-05-09
**Overall confidence:** HIGH (official docs verified)

## Executive Summary

Migrate all Electron/Node.js backend (~15 files) to Tauri 2 + Rust. Frontend rendering layer (React 19 + Vite 5 + TypeScript 5.5 + @rive-app/canvas) stays unchanged in the WebView. The stack follows Tauri 2 plugin architecture: core features as Tauri commands, plugins for OS integration, and axum for the embedded HTTP server on port 18765.

**Key architectural decision:** TTS audio is streamed from Rust to the WebView's Web Audio API (reusing the existing `StreamingAudioPlayer`), not played in Rust directly. This preserves the existing lip-sync pipeline and avoids redundant audio output layers.

---

## Core Framework

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Tauri | 2.11.1 | Desktop app framework (core crate) | Stable since Oct 2024, mature plugin ecosystem, proper tray icon API in core |
| tauri-build | 2.x | Build script (`build.rs`) | Required by Tauri 2 for codegen |
| Rust | 1.85+ (MSRV) | Backend language | Tauri 2 requires ≥1.77.2; latest stable is 1.85+ |
| tokio | 1.52.3 | Async runtime | Required by Tauri 2, axum, reqwest; features `["full"]` |
| Vite | ^5.3.1 | Frontend bundler (unchanged) | Already in use, Tauri v2 supports Vite natively |

### Tauri 2 vs Tauri 1 — What Changed

| Feature | Tauri 1 | Tauri 2 | Impact |
|---------|---------|---------|--------|
| System tray | `tauri::SystemTray` (separate crate) | `tauri::tray::TrayIconBuilder` (core feature, `tray-icon` cargo feature) | No plugin needed; bare `Cargo.toml` feature flag |
| Menu API | `tauri::CustomMenuItem` | `tauri::menu::MenuItemBuilder` | New builder pattern, cleaner |
| Window API | `Window`, `WindowBuilder` | `WebviewWindow`, `WebviewWindowBuilder` | Renamed for multi-webview support |
| JS API | `@tauri-apps/api/tauri` | `@tauri-apps/api/core` | Module renamed |
| Config | `tauri > allowlist` | Capabilities (`src-tauri/capabilities/`) | Permission system overhauled |
| Updater | Core module | `tauri-plugin-updater` | Extracted to plugin |
| HTTP | `tauri::api::http` | `tauri-plugin-http` or raw reqwest | Use raw reqwest on Rust side |
| Event system | `emit` / `listen_global` | `emit_to` / `listen_any` with `EventTarget` | Simpler, more explicit |
| Sidecar | `tauri::api::process::Command` | `tauri-plugin-shell` | Extracted to plugin |
| Mobile | — | iOS + Android support | Not relevant for this project |
| Permissions | `allowlist` in config | Capability files + permission scopes | More granular, slightly more boilerplate |

**Key migration patterns for this project:**
- `electron/ipc.ts` → Tauri commands (Rust `#[tauri::command]` + JS `invoke`)
- `electron/preload.ts` → Deleted entirely (Tauri uses `window.__TAURI__` or ES imports)
- `electron/window.ts` → `tauri.conf.json` window config + `WebviewWindowBuilder`
- `electron/tray.ts` → `TrayIconBuilder` in Rust setup
- `electron/main.ts` → `tauri::Builder::default().setup(|| { ... })`

### Feature Flags

```toml
# src-tauri/Cargo.toml
[dependencies]
tauri = { version = "2.11", features = ["tray-icon"] }
```

The `tray-icon` feature is required for system tray support. Other common features (`devtools`, `protocol`) are enabled by default where needed.

### RustToolchain

```toml
# rust-toolchain.toml
[toolchain]
channel = "stable"
targets = [
  "aarch64-apple-darwin",
  "x86_64-apple-darwin",
  "x86_64-unknown-linux-gnu",
  "x86_64-pc-windows-msvc",
]
```

**Source:** [Tauri 2.0 stable blog post](https://tauri.app/blog/tauri-20/) (Oct 2, 2024), [Upgrade guide](https://v2.tauri.app/start/migrate/from-tauri-1/), crates.io version check (2026-05-06)

---

## Plugins

| Plugin | Version | Purpose | Why |
|--------|---------|---------|-----|
| `tauri-plugin-updater` | 2.10.1 | Auto-update (replaces electron-updater) | Official, supports Windows/MSI, macOS/DMG, Linux/AppImage |
| `tauri-plugin-fs` | 2.5.1 | File system (replaces electron fs via IPC) | Scoped access model, needed for model scanning |
| `tauri-plugin-dialog` | 2.7.1 | File open/save dialogs (model import) | Native OS dialogs, replaces electron dialog |
| `tauri-plugin-shell` | 2.3.5 | Spawn system TTS commands (say, espeak) | Needed for system TTS provider |
| `tauri-plugin-process` | 2.x | App restart/exit after update | Required for clean update flow |
| `tauri-plugin-single-instance` | 2.4.2 | Prevent multiple app instances | Replaces Electron `app.requestSingleInstanceLock()` |
| `tauri-plugin-positioner` | 2.3.1 | Bottom-right window positioning | Anchoring to screen edge |
| `tauri-plugin-store` | 2.4.3 | Persist TTS config + app settings | Simple key-value store, replaces manual JSON read/write |
| `tauri-plugin-log` | 2.8.0 | Logging frontend (replaces electron-log) | Channels Rust `log` crate to WebView console + file |
| `tauri-plugin-window-state` | 2.4.1 | Remember window position/size | Saves/restores window geometry between launches |

### Plugin Setup Notes

**tauri-plugin-updater** does NOT include a built-in update dialog (removed in v2). You must implement custom check/download/install UI in the frontend. Uses public-key signature verification.

**tauri-plugin-fs** on the Rust side: the plugin is primarily for JS → Rust file access. For Rust → Rust file operations, use `std::fs` or `tokio::fs` directly. The plugin adds scope-based access control.

**tauri-plugin-shell** is how we'll spawn `say` (macOS), `espeak-ng` (Linux), and SAPI (Windows via PowerShell). The `tauri-plugin-shell` provides proper scoped command execution.

**Important:** All Tauri plugins follow semver but are `2.x` by convention. The specific patch versions (e.g., `2.5.1` for fs) should be treated as minimums. Use `"2"` in Cargo.toml for flexibility, or pin exact versions for CI reproducibility.

### Plugins NOT to Use

| Plugin | Why Not |
|--------|---------|
| `tauri-plugin-http` | Use raw `reqwest` from Rust commands instead; the plugin is for JS-side HTTP |
| `tauri-plugin-websocket` | Not needed; axum handles all HTTP |
| `tauri-plugin-cli` | No CLI args needed |
| `tauri-plugin-notification` | Use system TTS/spoken feedback instead |
| `tauri-plugin-global-shortcut` | Not currently needed (can add later) |

---

## HTTP Server (Adapter)

| Crate | Version | Purpose | Why |
|-------|---------|---------|-----|
| **axum** | 0.8.9 | HTTP server on port 18765 | Lightweight, async, great DX with extractors |
| `tokio` | 1.52.3 | Shared runtime (features = `["full"]`) | Tauri 2 already runs on tokio |
| `tower` | 0.5 | Middleware for axum | CORS, logging middleware |
| `tower-http` | 0.6 | HTTP middleware (CORS) | Needed for cross-origin agent webhooks |
| `hyper` | 1.x | HTTP implementation (via axum) | Transitive dep, axum v0.8 uses hyper 1.x |

### Axum vs actix-web

| Criterion | axum 0.8.9 | actix-web 4 |
|-----------|------------|-------------|
| Runtime | tokio (shared with Tauri) | actix-rt (separate runtime) |
| Integration difficulty | Trivial — same tokio runtime | Need to bridge runtimes |
| Community preference | Dominant in Tauri ecosystem | Less common in embedded scenarios |
| Binary size | ~200KB | ~300KB |
| Ecosystem | Tower middleware | Actix middleware |
| CORS support | `tower-http` | `actix-cors` |

**Recommendation: axum — HIGH confidence.** The critical advantage is that axum runs on the same tokio runtime that Tauri 2 already uses. actix-web requires its own runtime, creating complexity for state sharing and graceful shutdown.

### Embedding Pattern

```rust
// In Tauri setup, spawn the HTTP server on a separate tokio task
use std::sync::Arc;
use tokio::sync::Mutex;
use axum::{Router, routing::post, Json};

#[tauri::command]
// ... regular Tauri commands

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let app_handle = app.handle().clone();

            // Spawn axum server on shared tokio runtime
            tauri::async_runtime::spawn(async move {
                let state = AppState { handle: app_handle };
                let app = Router::new()
                    .route("/adapter", post(handle_adapter_event))
                    .route("/adapter/capabilities", axum::routing::get(get_capabilities))
                    .layer(tower_http::cors::CorsLayer::permissive())
                    .with_state(state);

                let listener = tokio::net::TcpListener::bind("127.0.0.1:18765").await.unwrap();
                axum::serve(listener, app).await.unwrap();
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

**Critical design note:** The axum server MUST NOT block Tauri's setup. Use `tauri::async_runtime::spawn` to start it as a background task. This is equivalent to the current Electron pattern where `adapter/server.ts` creates a Node.js `http.createServer`.

---

## TTS (Text-to-Speech)

| Crate | Version | Purpose | Why |
|-------|---------|---------|-----|
| `tauri-plugin-shell` | 2.3.5 | Spawn system TTS commands | Scoped command execution for `say`/`espeak-ng` |
| `reqwest` | 0.13.3 | HTTP client for cloud TTS | OpenAI, ElevenLabs, Azure TTS APIs |
| `serde` / `serde_json` | 1.0.228 / 1 | JSON deserialization | Parsing TTS API responses |

### TTS Architecture Decision: Stream to WebView Web Audio API

The existing architecture streams audio chunks via IPC → `StreamingAudioPlayer` (Web Audio API) → real-time RMS amplitude → mouth animation. This is the correct pattern and should be preserved.

**Do NOT use `rodio` or `cpal` for TTS playback in Rust.** Reasoning:

| Approach | Pros | Cons |
|----------|------|------|
| **Web Audio API (recommended)** | Reuses existing lip-sync pipeline; no new audio layer; WebView has full control | Audio must cross IPC boundary |
| `rodio` in Rust | Low-level audio control | Cannot feed into existing RMS → mouth animation; adds a second audio output point; complexity |
| `cpal` in Rust | Lowest latency | Same rodio issues + more boilerplate |

**The TTS flow stays:**
1. Frontend calls `invoke("speak_tts", { text, provider })`
2. Rust command dispatches to appropriate provider:
   - **system:** `tauri-plugin-shell` → spawns `say` on macOS, `espeak-ng` on Linux, PowerShell SAPI on Windows
   - **local:** `reqwest` → POST to local HTTP TTS service, stream response
   - **cloud:** `reqwest` → OpenAI/ElevenLabs/Azure API, stream response
3. Rust streams audio chunks back to frontend via Tauri event/Channel
4. Frontend `StreamingAudioPlayer` accumulates, decodes, plays, and performs RMS analysis

### System TTS Provider (Cross-Platform)

| Platform | Command | Notes |
|----------|---------|-------|
| macOS | `say -o /tmp/tts.wav "{text}"` | Built-in, zero dependencies |
| Windows | PowerShell SAPI via `Add-Type -AssemblyName System.Speech` | Available since Windows Vista |
| Linux | `espeak-ng "{text}" --stdout > /tmp/tts.wav` | Requires `espeak-ng` package |

All system providers write WAV to temp file, then Rust reads and streams chunks. The `tauri-plugin-shell` provides scoped execution for these commands.

---

## HTTP Client (AI Planner)

| Crate | Version | Purpose | Why |
|-------|---------|---------|-----|
| **reqwest** | 0.13.3 | OpenAI API calls | Replaces `openai` npm package |
| `serde` | 1.0.228 | Request/response serialization | JSON schema for OpenAI API |
| `serde_json` | 1 | JSON parsing | OpenAI streaming chunks (SSE) |
| `futures` | 0.3 | Stream processing | SSE streaming from OpenAI API |
| `tokio` | 1.52.3 | Async runtime | Shared with Tauri |

### reqwest vs ureq vs Official OpenAI Rust SDK

| Crate | Pros | Cons |
|-------|------|------|
| **reqwest 0.13.3** | Async, tokio-native, streaming SSE, Tauri-compatible | Slightly heavier binary |
| `ureq` | Simpler sync API | No native async/streaming; bad for SSE |
| `async-openai` | OpenAI-specific, typed API | Extra abstraction layer; less flexible for custom endpoints |

**Recommendation: reqwest — HIGH confidence.** The current Electron code uses the official `openai` npm package, which handles streaming SSE. `reqwest` with `tokio::sync::mpsc` channels provides equivalent streaming support without adding an unnecessary Rust wrapper crate. Raw reqwest also gives us flexibility for ElevenLabs, Azure, and other non-OpenAI endpoints.

### OpenAI SSE Streaming Pattern

```rust
use reqwest::Client;
use futures::StreamExt;

async fn call_openai(api_key: &str, messages: Vec<ChatMessage>) -> Result<String> {
    let client = Client::new();
    let response = client
        .post("https://api.openai.com/v1/chat/completions")
        .header("Authorization", format!("Bearer {}", api_key))
        .json(&serde_json::json!({
            "model": "gpt-4o",
            "messages": messages,
            "stream": true
        }))
        .send()
        .await?;

    let mut stream = response.bytes_stream();
    while let Some(chunk) = stream.next().await {
        // Process SSE chunk, send to frontend via Tauri event
    }
    Ok(accumulated_text)
}
```

---

## State Management & Error Handling

| Crate | Version | Purpose | Why |
|-------|---------|---------|-----|
| `serde` | 1.0.228 | Serialization for Tauri commands | All Tauri commands return serializable types |
| `serde_json` | 1 | JSON handling | Configs, OpenAI responses, adapter protocol |
| `anyhow` | 1.0.102 | Error handling in setup/spawn | ? operator for complex async tasks |
| `thiserror` | 2.0.18 | Typed error types for commands | Required for Tauri command error types |
| `chrono` | 0.4 | Timestamps | Log timestamps, TTS config metadata |
| `uuid` | 1 | Session IDs | AI planner session tracking |

### Error Handling Pattern

Tauri commands require errors that implement `Serialize`:

```rust
#[derive(Debug, thiserror::Error)]
pub enum TtsError {
    #[error("TTS provider error: {0}")]
    Provider(String),
    #[error("Network error: {0}")]
    Network(#[from] reqwest::Error),
    #[error("Serialization error: {0}")]
    Serde(#[from] serde_json::Error),
}

impl Serialize for TtsError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where S: serde::Serializer {
        serializer.serialize_str(self.to_string().as_str())
    }
}

type Result<T> = std::result::Result<T, TtsError>;
```

- **`thiserror`** for command error types (must impl `Serialize`)
- **`anyhow`** for internal setup code (not exposed to frontend)
- This matches Tauri 2's [error handling pattern](https://v2.tauri.app/develop/calling-rust/#error-handling)

---

## Logging

| Crate | Version | Purpose | Why |
|-------|---------|---------|-----|
| `tauri-plugin-log` | 2.8.0 | Logging plugin | Official, integrates Rust `log` with frontend |
| `log` | 0.4 | Log facade | Required by tauri-plugin-log |
| `tracing` | 0.1.44 | Structured diagnostics | Deeper visibility for axum/reqwest |
| `tracing-subscriber` | 0.3.23 | Tracing output formatting | Filter + fmt layers |

### Architecture

**Two-tier logging:**
1. **`log` crate** — Used by Tauri commands and general app code. `tauri-plugin-log` captures these and sends to WebView console + file.
2. **`tracing`** — Used in axum server and reqwest client for request-level tracing. `tracing-subscriber` formats to stdout.

```rust
// In Tauri setup:
fn main() {
    // tracing for low-level instrumentation (axum, reqwest)
    tracing_subscriber::fmt()
        .with_env_filter("info,hermes_pet=debug,axum=info")
        .init();

    // tauri-plugin-log for app-level logging (captured by frontend)
    tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::new()
            .level(log::LevelFilter::Debug)
            .target(tauri_plugin_log::Target::new(
                tauri_plugin_log::TargetKind::LogDir {
                    file_name: Some("vivipet.log".into()),
                },
            ))
            .build())
        .run(tauri::generate_context!())
}
```

**Why not tracing alone?** `tauri-plugin-log` bridges Rust's `log` crate to the WebView console (`console.log`), which is essential for debugging from DevTools. `tracing` alone doesn't provide this bridge.

**Source:** [Tauri Logging Plugin docs](https://v2.tauri.app/plugin/logging/), crates.io (2026-05-09)

---

## Audio

### TTS Audio Playback

As discussed above, TTS audio is played via the WebView's Web Audio API (existing `StreamingAudioPlayer`), not in Rust. This means:

**No additional Rust audio crate is needed for playback.**

The flow for system TTS (say/espeak):

```
Rust: spawn system command → write WAV to temp file → read file → split into chunks
  → IPC Channel → Frontend: StreamingAudioPlayer → Web Audio API → lip sync
```

The flow for cloud/local TTS:

```
Rust: reqwest streaming response → decode audio chunks
  → IPC Channel → Frontend: StreamingAudioPlayer → Web Audio API → lip sync
```

### Audio Decoding (Rust Side)

| Crate | Version | Purpose | Why |
|-------|---------|---------|-----|
| `hound` | 3.5 | WAV parsing | Read WAV files from `say`/`espeak-ng` output |
| `bytes` | 1 | Audio chunk buffer type | Common in reqwest streaming responses |
| `base64` | 0.22 | Decode base64 PCM from cloud APIs | Some TTS APIs return base64-encoded audio |

**Do NOT use:** `Symphonia`, `Rodio`, `CPAL` — these are for playback, which happens in the WebView.

---

## Model Management & File System

| Crate | Version | Purpose | Why |
|-------|---------|---------|-----|
| `tauri-plugin-fs` | 2.5.1 | Scoped file access from JS | Required for JS-side file operations |
| `std::fs` / `tokio::fs` | stdlib | Rust-side file operations | Scanning model directories, reading .riv files |
| `walkdir` | 2.5 | Recursive directory scanning | Finding .riv files in model directories |
| `tauri-plugin-dialog` | 2.7.1 | Native file open dialog | Model import (.riv / .zip) |
| `glob` | 0.3 | Pattern matching for model files | Alternative to walkdir for simple patterns |

### File System Strategy

**Rust side** (for model scanning, registry building):
- Use `std::fs` + `walkdir` for directory traversal
- Use `serde_json` for reading/writing `models.json`

**JS side** (via tauri-plugin-fs):
- Read model config files
- Access user-imported model files
- All operations go through scope-based permissions

**Important:** `tauri-plugin-fs` docs explicitly say: *"If you want to manipulate files/directories through Rust, use traditional Rust's libs (std::fs, tokio::fs, etc)."* So for Rust Tauri commands, use stdlib, not the plugin.

---

## Dependencies: Complete Cargo.toml

```toml
[package]
name = "vivi-pet"
version = "0.1.0"
edition = "2021"

[lib]
name = "vivi_pet_lib"
crate-type = ["staticlib", "cdylib", "rlib"]

[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
# Core
tauri = { version = "2.11", features = ["tray-icon"] }
tauri-plugin-updater = "2"
tauri-plugin-fs = "2"
tauri-plugin-dialog = "2"
tauri-plugin-shell = "2"
tauri-plugin-process = "2"
tauri-plugin-single-instance = "2"
tauri-plugin-positioner = "2"
tauri-plugin-store = "2"
tauri-plugin-log = "2"
tauri-plugin-window-state = "2"

# HTTP Server
axum = "0.8"
tower = "0.5"
tower-http = { version = "0.6", features = ["cors"] }
tokio = { version = "1", features = ["full"] }

# HTTP Client
reqwest = { version = "0.13", features = ["json", "stream"] }

# Serialization
serde = { version = "1", features = ["derive"] }
serde_json = "1"

# Error Handling
thiserror = "2"
anyhow = "1"

# Async
futures = "0.3"
bytes = "1"

# Audio
hound = "3.5"
base64 = "0.22"

# File System
walkdir = "2"

# Logging
log = "0.4"
tracing = "0.1"
tracing-subscriber = { version = "0.3", features = ["env-filter"] }

# Utilities
chrono = { version = "0.4", features = ["serde"] }
uuid = { version = "1", features = ["v4"] }
```

**Frontend packages to REMOVE:**
- `electron` (devDep) — Entirely replaced by Tauri
- `electron-builder` (devDep) — Replaced by `tauri build`
- `electron-log` — Replaced by `@tauri-apps/plugin-log` + `tracing`
- `openai` — Replaced by Rust `reqwest` commands

**Frontend packages to ADD:**
- `@tauri-apps/api` (core bridge)
- `@tauri-apps/plugin-log` (log bridge)
- `@tauri-apps/plugin-updater` (update check UI)
- `@tauri-apps/plugin-fs` (if JS-side file ops needed)
- `@tauri-apps/plugin-dialog` (file dialogs from JS)
- `@tauri-apps/plugin-process` (restart after update)

---

## Frontend (Unchanged)

| Technology | Version | Notes |
|------------|---------|-------|
| React | 19.2.3 | Unchanged from current |
| Vite | 5.3.1 | Tauri v2 supports Vite via `frontendDist` config |
| TypeScript | 5.5.2 | Unchanged |
| @rive-app/canvas | 2.37.5 | Unchanged — runs in WebView |

### Vite Config Changes

```typescript
// vite.config.ts — change from current Electron config to Tauri-compatible
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Clear screen: Electron apps use whole screen, Tauri uses the webview size
  clearScreen: false,
  server: {
    port: 1420, // Tauri dev server port (convention)
    strictPort: true,
  },
  // Prevent vite from obscuring rust errors
  envPrefix: ['VITE_', 'TAURI_'],
  build: {
    target: process.env.TAURI_PLATFORM === 'windows' ? 'chrome105' : 'safari14',
    minify: !process.env.TAURI_DEBUG ? 'esbuild' : false,
    sourcemap: !!process.env.TAURI_DEBUG,
  },
});
```

### Tauri Config

```json
{
  "$schema": "https://raw.githubusercontent.com/nicegui/nicegui/main/nicegui/static/tauri/config.schema.json",
  "productName": "ViviPet",
  "version": "0.2.0",
  "identifier": "com.vivipet.app",
  "build": {
    "frontendDist": "../dist",
    "devUrl": "http://localhost:1420",
    "beforeBuildCommand": "npm run build:renderer",
    "beforeDevCommand": "npm run dev:renderer"
  },
  "app": {
    "windows": [
      {
        "title": "ViviPet",
        "width": 750,
        "height": 700,
        "decorations": false,
        "transparent": true,
        "alwaysOnTop": true,
        "resizable": false
      }
    ],
    "security": {
      "csp": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'"
    },
    "withGlobalTauri": true
  },
  "bundle": {
    "active": true,
    "targets": "all",
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ],
    "createUpdaterArtifacts": true,
    "macOS": {
      "frameworks": [],
      "minimumSystemVersion": "12.0"
    },
    "linux": {
      "deb": {
        "depends": ["libwebkit2gtk-4.1-dev"]
      }
    },
    "windows": {
      "nsis": {
        "installMode": "currentUser"
      }
    }
  }
}
```

---

## Cross-Platform Build

### GitHub Actions CI

Use `tauri-apps/tauri-action@v0` for automated builds. Reference workflow from [Tauri GitHub Pipeline docs](https://v2.tauri.app/distribute/pipelines/github/).

```yaml
name: 'publish'
on:
  push:
    branches: [release]

jobs:
  publish-tauri:
    permissions:
      contents: write
    strategy:
      fail-fast: false
      matrix:
        include:
          - platform: 'macos-latest'
            args: '--target aarch64-apple-darwin'
          - platform: 'macos-latest'
            args: '--target x86_64-apple-darwin'
          - platform: 'ubuntu-22.04'
            args: ''
          - platform: 'windows-latest'
            args: ''
    runs-on: ${{ matrix.platform }}
    steps:
      - uses: actions/checkout@v4
      - name: install dependencies (ubuntu only)
        if: matrix.platform == 'ubuntu-22.04'
        run: |
          sudo apt-get update
          sudo apt-get install -y libwebkit2gtk-4.1-dev \
            libappindicator3-dev librsvg2-dev patchelf
      - name: setup node
        uses: actions/setup-node@v4
        with:
          node-version: lts/*
          cache: 'npm'
      - name: install Rust stable
        uses: dtolnay/rust-toolchain@stable
        with:
          targets: ${{ matrix.platform == 'macos-latest' && 'aarch64-apple-darwin,x86_64-apple-darwin' || '' }}
      - name: Rust cache
        uses: swatinem/rust-cache@v2
        with:
          workspaces: './src-tauri -> target'
      - name: install frontend dependencies
        run: yarn install
      - name: build and release
        uses: tauri-apps/tauri-action@v0
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
          TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}
        with:
          tagName: v__VERSION__
          releaseName: 'ViviPet v__VERSION__'
          releaseDraft: true
          args: ${{ matrix.args }}
```

**Key build considerations:**
- Linux requires `libwebkit2gtk-4.1-dev` (WebKitGTK 4.1, NOT 4.0 — v2 requires 4.1)
- macOS cross-compilation (arm64 + x64) needs `aarch64-apple-darwin` and `x86_64-apple-darwin` targets
- AppImage builds on `ubuntu-22.04` or `ubuntu-24.04` (not older)
- All targets are built from the same repo with conditional compilation
- **TAURI_SIGNING_PRIVATE_KEY** env var required for updater (set as GitHub secret)

**Source:** [Tauri GitHub Pipeline docs](https://v2.tauri.app/distribute/pipelines/github/) (last updated Mar 2, 2026)

---

## Architecture Overview (Rust Module Layout)

```
src-tauri/
├── Cargo.toml
├── tauri.conf.json
├── capabilities/
│   └── default.json              ← Permission capabilities
├── icons/                         ← App icons
├── src/
│   ├── main.rs                   ← Entry point (calls lib::run())
│   ├── lib.rs                    ← Tauri setup, plugin registration
│   ├── commands/                 ← Tauri #[tauri::command] handlers
│   │   ├── mod.rs
│   │   ├── tts.rs                ← TTS commands (speak, stop, config)
│   │   ├── model.rs              ← Model management (list, import)
│   │   ├── window.rs             ← Window positioning, drag, resize
│   │   └── planner.rs            ← AI planner OpenAI calls
│   ├── tts/                      ← TTS engine (ported from tts-manager.ts)
│   │   ├── mod.rs
│   │   ├── manager.rs            ← Queue, provider dispatch, text splitting
│   │   ├── config.rs             ← TTS config types, persistence
│   │   ├── system.rs             ← System provider (say/espeak/SAPI)
│   │   ├── local.rs              ← Local HTTP TTS provider
│   │   └── cloud.rs              ← Cloud TTS provider (OpenAI/ElevenLabs/Azure)
│   ├── adapter/                  ← HTTP adapter (ported from adapter/server.ts)
│   │   ├── mod.rs
│   │   ├── server.rs             ← Axum router setup
│   │   ├── protocol.rs           ← Event normalization
│   │   ├── normalize.rs          ← Agent → pet state mapping
│   │   └── policy.rs             ← Behavior policy rules
│   ├── planner/                  ← AI behavior planner
│   │   ├── mod.rs
│   │   └── openai.rs             ← OpenAI function calling
│   ├── model/                    ← Model management
│   │   ├── mod.rs
│   │   ├── registry.rs           ← Model scanning + registry
│   │   └── import.rs             ← Model file import
│   └── state.rs                  ← Global app state (Mutex/Arc)
```

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| HTTP Server | axum 0.8 | actix-web 4 | Separate runtime from tokio; heavier; less Tauri community usage |
| HTTP Client | reqwest 0.13 | ureq 3.x | No async streaming support needed for SSE |
| HTTP Client | reqwest 0.13 | async-openai 0.26 | Extra abstraction; less flexible for non-OpenAI endpoints |
| Logging | tauri-plugin-log + tracing | tracing-tauri | Less maintained; tauri-plugin-log is official |
| Audio in Rust | None (stream to WebView) | rodio 0.18 | Cannot feed into existing lip-sync; adds complexity |
| Audio in Rust | None (stream to WebView) | cpal 0.15 | Same rodio issue; more boilerplate |
| Model scanning | walkdir 2.5 | glob 0.3 | walkdir handles recursive scans naturally |
| File open dialog | tauri-plugin-dialog | rfd 15.x | Official plugin > third-party for security integration |
| Error handling | thiserror 2 + anyhow 1 | snafu 0.8 | thiserror is Tauri ecosystem standard; snafu adds learning curve |
| TTS file parsing | hound 3.5 | symphonia 0.5 | hound is simpler for WAV-only; symphonia for multi-format |
| Config persistence | tauri-plugin-store | confy 0.6 | Official plugin integrates with Tauri permission model |
| Async runtime | tokio (via Tauri) | smol | Tauri 2 uses tokio; smol would require runtime bridge |

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Core Tauri 2 stack | HIGH | Verified against crates.io (v2.11.1) and official docs |
| Plugin versions | HIGH | All verified against crates.io API |
| Axum integration | HIGH | Established pattern in Tauri community; same tokio runtime |
| TTS architecture | HIGH | Preserves existing working pipeline; rust side handles encoding only |
| OpenAI/reqwest | HIGH | reqwest is standard Rust HTTP client with SSE support |
| Cross-platform build | HIGH | Official Tauri CI workflow template verified |
| System TTS per platform | MEDIUM | Windows SAPI via PowerShell needs verification; Linux `espeak-ng` path TBD |
| Tauri 2 edge cases | MEDIUM | Some plugin APIs may have platform-specific quirks (e.g., Linux tray events) |

**Total confidence:** HIGH. This is a well-trodden migration path. Tauri 2 has been stable since Oct 2024 (18+ months as of May 2026). All core crates are mature. The main risk areas are platform-specific TTS implementations (Windows SAPI) and the axum graceful shutdown interaction with Tauri's lifecycle.

---

## Key Decisions Summary

1. **axum over actix-web** — Shared tokio runtime with Tauri
2. **Stream audio to WebView** — Preserve existing lip-sync pipeline, no rodio/cpal
3. **reqwest over ureq** — Async SSE streaming for OpenAI/cloud TTS
4. **Raw reqwest over async-openai** — Flexibility for multiple TTS providers
5. **tauri-plugin-log + tracing** — Official log plugin + structured tracing for axum
6. **walkdir for file scanning** — Natural recursive directory traversal
7. **tauri-plugin-store for config** — Tauri-native persistence with permission model
8. **truncate `electron/` on migration** — All Electron.ts files become Rust modules

---

## Sources

- [Tauri 2.0 Stable Release](https://tauri.app/blog/tauri-20/) — Oct 2, 2024
- [Tauri Upgrade Guide (v1 → v2)](https://v2.tauri.app/start/migrate/from-tauri-1/) — Accessed May 2026
- [Tauri System Tray Guide](https://v2.tauri.app/learn/system-tray/) — Updated Apr 20, 2026
- [Tauri Updater Plugin](https://v2.tauri.app/plugin/updater/) — Updated Nov 28, 2025
- [Tauri File System Plugin](https://v2.tauri.app/plugin/file-system/) — Accessed May 2026
- [Tauri Logging Plugin](https://v2.tauri.app/plugin/logging/) — Updated Jul 3, 2025
- [Tauri Window Customization](https://v2.tauri.app/learn/window-customization/) — Updated Aug 5, 2025
- [Tauri GitHub Pipeline](https://v2.tauri.app/distribute/pipelines/github/) — Updated Mar 2, 2026
- [Tauri Localhost Plugin](https://v2.tauri.app/plugin/localhost/) — Updated Feb 22, 2025
- crates.io API — Version lookups for all crates (May 9, 2026)
  - tauri: v2.11.1
  - axum: v0.8.9
  - tokio: v1.52.3
  - reqwest: v0.13.3
  - tauri-plugin-updater: v2.10.1
  - tauri-plugin-fs: v2.5.1
  - tauri-plugin-log: v2.8.0
  - tauri-plugin-shell: v2.3.5
  - tauri-plugin-dialog: v2.7.1
  - tauri-plugin-store: v2.4.3
  - tauri-plugin-positioner: v2.3.1
  - tauri-plugin-window-state: v2.4.1
  - tauri-plugin-single-instance: v2.4.2
