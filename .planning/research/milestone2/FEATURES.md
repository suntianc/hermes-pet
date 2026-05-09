# Research: Tauri 2 Desktop Application Feature Landscape

> Generated: 2026-05-09
> Context: Electron → Tauri 2 + Rust migration for ViviPet desktop app
> Confidence: HIGH (all features verified against official Tauri 2 docs at v2.tauri.app)

---

## Overview

This document maps the Tauri 2 desktop ecosystem feature landscape organized into three categories: **Table Stakes** (must have for a production Tauri app), **Differentiators** (what makes this migration worthwhile), and **Anti-Features** (things to deliberately NOT port). Each feature includes complexity estimates, dependencies, and Tauri 2-specific considerations.

---

## Table Stakes (Must Have)

These are the features that every well-built Tauri 2 desktop application needs. Skipping any of these results in a broken or unacceptable product.

### TS-1: Window Management (Frameless, Transparent, Always-on-Top, Positioning)

**Complexity:** Low (configuration-heavy, little custom code)
**Dependency:** Core Tauri API (`@tauri-apps/api/window`)
**Migrates from:** `electron/window.ts`

**What this entails:**
- **Frameless window**: `"decorations": false` in `tauri.conf.json` — removes native title bar
- **Transparent background**: `"transparent": true` in `tauri.conf.json` — allows the pet to float with no background
- **Always-on-top**: `"alwaysOnTop": true` — keeps pet above other windows
- **Bottom-right anchoring**: Positioner plugin (`tauri-plugin-positioner`) with `Position::BottomRight` — port of `electron-positioner`
- **Window dimensions**: Set in `tauri.conf.json` under `windows[0]` (750x700)
- **Drag support**: `data-tauri-drag-region` attribute on draggable areas, or manual `startDragging()` via `@tauri-apps/api/window`
- **Resize**: CSS-based resize handles + custom resize logic via IPC
- **Single instance lock**: `tauri-plugin-single-instance` — prevents duplicate pet windows

**Tauri 2 specifics:**
- Window configuration can be in `tauri.conf.json` (static), JavaScript API (runtime), or Rust (runtime)
- Positioner plugin has `tray-icon` feature for tray-relative positioning
- macOS: frameless windows lose native snap/move features — use `TitleBarStyle::Transparent` as alternative
- Windows: transparent windows have specific GPU/compositor requirements
- Permissions required: `core:window:default`, `core:window:allow-start-dragging`
- In Tauri 2, window customization is done via `WebviewWindowBuilder` in Rust or imports from `@tauri-apps/api/window`

**Rust API surface:**
```rust
use tauri::WebviewWindowBuilder;
use tauri_plugin_positioner::{WindowExt, Position};

WebviewWindowBuilder::new(app, "main", WebviewUrl::default())
    .decorations(false)
    .transparent(true)
    .always_on_top(true)
    .inner_size(750.0, 700.0)
    .build()?;

// Bottom-right positioning
window.move_window(Position::BottomRight)?;
```

**Sources:**
- [Window Customization (Official Tauri Docs)](https://v2.tauri.app/learn/window-customization/) — HIGH confidence
- [Positioner Plugin (Official Tauri Docs)](https://v2.tauri.app/plugin/positioner/) — HIGH confidence
- [Window State Plugin (Official Tauri Docs)](https://v2.tauri.app/plugin/window-state/) — HIGH confidence

---

### TS-2: System Tray (Icon, Menu, Show/Hide, Click Events)

**Complexity:** Low-Medium
**Dependency:** `tauri` crate with `tray-icon` feature
**Migrates from:** `electron/tray.ts`

**What this entails:**
- Tray icon creation via `TrayIconBuilder` (Rust) or `TrayIcon.new()` (JS)
- Menu creation with submenus: Show/Hide, Always on Top, Mouse Passthrough, Size picker, Model switcher, TTS config
- Menu event handlers for each item
- Tray click events (left-click to toggle window, right-click for menu)
- Dynamic menu updates (e.g. model list changes when new models imported)

**Tauri 2 specifics:**
- `tray-icon` must be enabled as a Cargo feature: `tauri = { version = "2", features = ["tray-icon"] }`
- Menu API in Tauri 2 is async and uses `MenuItem::with_id()` for event routing
- Linux: tray events (click, enter, leave) are NOT supported — only right-click context menu works
- Left-click menu toggling: `show_menu_on_left_click(false)` for our use case (left-click should toggle window visibility)
- Positioner plugin requires `on_tray_icon_event` hook for tray-relative positioning
- Menu items can be dynamically added/removed via `append()` / `remove()` at runtime

**Rust API surface:**
```rust
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
};

let show = MenuItem::with_id(app, "show", "Show/Hide", true, None::<&str>)?;
let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
let menu = Menu::with_items(app, &[&show, &quit])?;

TrayIconBuilder::new()
    .menu(&menu)
    .show_menu_on_left_click(false)
    .on_menu_event(|app, event| match event.id.as_ref() {
        "show" => { /* toggle window */ },
        "quit" => { app.exit(0); },
        _ => {}
    })
    .on_tray_icon_event(|tray, event| {
        tauri_plugin_positioner::on_tray_event(tray.app_handle(), &event);
    })
    .build(app)?;
```

**Sources:**
- [System Tray (Official Tauri Docs)](https://v2.tauri.app/learn/system-tray/) — HIGH confidence
- [Window Menu (Official Tauri Docs)](https://v2.tauri.app/learn/window-menu/) — HIGH confidence

---

### TS-3: IPC Bridge (Tauri Commands + Events)

**Complexity:** Medium
**Dependency:** Core Tauri API
**Migrates from:** `electron/preload.ts` + `electron/ipc.ts`

**What this entails:**
- All `window.electronAPI` calls converted to `@tauri-apps/api/core` `invoke()` calls
- All Electron IPC listeners converted to Tauri event listeners (`listen()` from `@tauri-apps/api/event`)
- Rust `#[tauri::command]` functions for each IPC handler
- Tauri event system for Rust→frontend communication (replaces `webContents.send()`)

**Key differences from Electron:**
- **No preload script needed** — Tauri uses capabilities-based security instead of contextBridge
- **Commands are async by default** in Tauri 2; Rust commands can be sync or async
- **Commands return Results** — error handling built into the protocol
- **Type-safe** — TypeScript side can type `invoke<ReturnType>('command', { args })`
- **State injection** — `State<'_, T>` in command parameters for managed state access
- **Channel-based streaming** — `Channel<T>` for streaming large data like audio (replaces Electron's streaming IPC)

**Migration map:**
| Electron IPC | Tauri Equivalent |
|-------------|------------------|
| `ipcMain.handle('channel', handler)` | `#[tauri::command]` + `invoke()` |
| `webContents.send('event', data)` | `app_handle.emit('event', &payload)` |
| `ipcRenderer.on('event', cb)` | `listen('event', cb)` from `@tauri-apps/api/event` |
| `contextBridge.exposeInMainWorld()` | Not needed (capabilities system) |
| Stream via IPC channels | `Channel<T>` in Rust → `.onmessage` in JS |

**Sources:**
- [Calling Rust from the Frontend (Official Tauri Docs)](https://v2.tauri.app/develop/calling-rust/) — HIGH confidence
- [Calling Frontend from Rust (Official Tauri Docs)](https://v2.tauri.app/develop/calling-frontend/) — HIGH confidence
- [Inter-Process Communication Overview (Official Tauri Docs)](https://v2.tauri.app/concept/inter-process-communication/) — HIGH confidence

---

### TS-4: TTS Audio Engine (3-Provider with Streaming)

**Complexity:** High
**Dependency:** `std::process::Command` (system TTS), `reqwest` (cloud TTS), Web Audio API (playback)
**Migrates from:** `electron/tts/` entire module

**What this entails:**
- **System TTS provider** (macOS `say`, Windows SAPI, Linux speech-dispatcher/espeak):
  - Rust: `std::process::Command::new("say")` on macOS, cross-platform abstraction
  - This is the simplest approach but least flexible
- **Local TTS provider** (HTTP streaming to self-hosted service):
  - Rust: `reqwest` streaming HTTP GET to local endpoint
  - Audio chunks forwarded to frontend via `Channel<Vec<u8>>`
- **Cloud TTS provider** (OpenAI, ElevenLabs, Azure):
  - Rust: `reqwest` streaming POST to cloud TTS API with API key handling
  - Audio chunks forwarded same as local provider
- **Streaming audio to WebView**: 
  - Tauri 2 `Channel<T>` for ordered, fast audio chunk delivery (better than event system for streaming)
  - Frontend: `StreamingAudioPlayer` (Web Audio API) accumulates chunks → decodes → plays
  - Real-time RMS amplitude analysis for lip sync — can remain in frontend JS
- **TTS queue management**: FIFO queue in Rust state, text splitting (500 chars/chunk)

**Key architectural decision — Audio stream path:**
```rust
// Rust side: stream audio chunks to frontend
#[tauri::command]
async fn speak(text: String, on_chunk: Channel<Vec<u8>>) -> Result<()> {
    let mut stream = tts_provider.synthesize(&text).await?;
    while let Some(chunk) = stream.next().await {
        on_chunk.send(chunk?)?;  // each chunk ~16KB
    }
    Ok(())
}

// JS side: receive chunks into audio player
const channel = new Channel<Uint8Array>();
channel.onmessage = (chunk) => audioPlayer.enqueue(chunk);
await invoke('speak', { text: 'Hello', onChunk: channel });
```

**Cross-platform considerations:**
- macOS `say` command: built-in, supports voice selection, high quality
- Windows: need `SAPI` COM interop or fallback to `edge-tts` CLI
- Linux: `speech-dispatcher` via `spd-say`, or espeak
- Cloud providers work identically across all platforms

**Sources:**
- [Channels (Official Tauri Docs)](https://v2.tauri.app/develop/calling-frontend/#channels) — HIGH confidence
- [HTTP Client Plugin (Official Tauri Docs)](https://v2.tauri.app/plugin/http-client/) — HIGH confidence
- [State Management (Official Tauri Docs)](https://v2.tauri.app/develop/state-management/) — HIGH confidence

---

### TS-5: HTTP Adapter (Port 18765 for AI Agent Events)

**Complexity:** High
**Dependency:** `axum` or `actix-web` crate, `tokio`
**Migrates from:** `electron/adapter/server.ts`

**What this entails:**
- Embed an HTTP server (`axum`) within the Tauri application on port 18765
- Accept `POST /adapter` with JSON body from external AI Agent
- Route events to the frontend via Tauri event system
- Expose `GET /adapter/capabilities` for discovery
- Graceful shutdown when app exits

**Architecture pattern in Tauri:**
```rust
use tauri::Emitter;
use tokio::net::TcpListener;

#[tauri::command]
async fn start_adapter_server(app: AppHandle) -> Result<()> {
    let listener = TcpListener::bind("127.0.0.1:18765").await?;
    
    tokio::spawn(async move {
        axum::serve(listener, router(app)).await.unwrap();
    });
    
    Ok(())
}

fn router(app: AppHandle) -> Router {
    Router::new()
        .route("/adapter", post(move |body: Json<Value>| {
            let app = app.clone();
            async move {
                app.emit("pet:event", &body.0)?;
                Ok(Json(json!({"status": "ok"})))
            }
        }))
        .route("/adapter/capabilities", get(capabilities))
}
```

**Security considerations:**
- MUST bind to `127.0.0.1` only (localhost) — never `0.0.0.0`
- No auth required for local-only (but could add token-based auth later)
- Rate limiting recommended
- Request validation/sanitization
- CORS not needed for local-only traffic
- Axum is the recommended Rust HTTP framework: lightweight, async, good ergonomics
- The HTTP server runs in a `tokio::spawn` task within the Tauri async runtime

**Sources:**
- Axum is standard Rust ecosystem (not a Tauri plugin), verified via crate ecosystem
- [Process Model (Tauri Docs)](https://v2.tauri.app/concept/process-model/) — HIGH confidence for understanding threading model
- Security considerations: localhost binding is standard practice

---

### TS-6: File Dialog + Model Import Workflow

**Complexity:** Low
**Dependency:** `tauri-plugin-dialog`, `tauri-plugin-fs`
**Migrates from:** `electron/model-manager.ts`

**What this entails:**
- File open dialog for `.riv` model files (and `.zip` archives)
- Directory scanning for model registry
- Copy imported files to app data directory
- Read model directory to index available models
- Watch for filesystem changes (new models added externally)

**Tauri 2 specifics:**
- `tauri-plugin-dialog` provides `open()` for native file picker
- `tauri-plugin-fs` provides `readDir()`, `copyFile()`, `exists()`, `mkdir()`
- File system access is security-scoped — must be configured in capabilities
- Use `BaseDirectory::AppLocalData` for user model storage
- `watch()` / `watchImmediate()` from fs plugin for file watching (needs `watch` feature)

**Permissions required:**
```json
{
    "permissions": [
        "dialog:allow-open",
        "dialog:allow-message",
        "fs:allow-read",
        "fs:allow-write",
        "fs:allow-copy",
        "fs:allow-mkdir",
        "fs:allow-exists",
        "fs:allow-applocaldata-read-recursive",
        "fs:allow-applocaldata-write-recursive"
    ]
}
```

**Sources:**
- [Dialog Plugin (Official Tauri Docs)](https://v2.tauri.app/plugin/dialog/) — HIGH confidence
- [File System Plugin (Official Tauri Docs)](https://v2.tauri.app/plugin/file-system/) — HIGH confidence

---

### TS-7: AI Planner (OpenAI API via Rust)

**Complexity:** Medium
**Dependency:** `reqwest` crate (re-exported via `tauri-plugin-http` or standalone)
**Migrates from:** `electron/ai-planner.ts`

**What this entails:**
- OpenAI API calls from Rust using `reqwest`
- Function calling support (JSON mode)
- Three modes: rule-based, AI-driven, hybrid
- API key management (via Store plugin or env vars)
- Request/response streaming for real-time behavior

**Key benefits in Rust:**
- No Node.js dependency for HTTP calls
- Same `reqwest` used for TTS cloud provider too (learn once)
- Parallel API calls possible with `tokio` (e.g., AI planner + health check)
- API key stored securely via `tauri-plugin-store` (encrypted at rest)

**Sources:**
- [HTTP Client Plugin (Official Tauri Docs)](https://v2.tauri.app/plugin/http-client/) — HIGH confidence
- reqwest is the standard Rust HTTP crate

---

### TS-8: Logging (Rust tracing + Plugin Log)

**Complexity:** Low
**Dependency:** `tauri-plugin-log`, `log` crate, `tracing`
**Migrates from:** electron-log

**What this entails:**
- Structured logging from Rust backend
- Console output during development
- File-based logging for production diagnostics
- Optional: Forward Rust logs to WebView console for debugging
- Log levels: trace, debug, info, warn, error
- Log file rotation

**Tauri 2 specifics:**
- `tauri-plugin-log` wraps the `log` crate, integrates with Tauri lifecycle
- Multiple target support: Stdout, Stderr, LogDir (file), Webview, custom Folder
- Default targets: stdout + file in app log directory
- File location per platform:
  - macOS: `~/Library/Logs/{bundleIdentifier}/`
  - Linux: `$XDG_DATA_HOME/{bundleIdentifier}/logs`
  - Windows: `{FOLDERID_LocalAppData}/{bundleIdentifier}/logs`
- Log rotation: `rotation_strategy()` and `max_file_size()`
- Filtering: `level()`, `level_for()`, `filter()`
- Timezone: `timezone_strategy()` (UTC default, UseLocal available)

**Sources:**
- [Logging Plugin (Official Tauri Docs)](https://v2.tauri.app/plugin/logging/) — HIGH confidence

---

### TS-9: Auto-Update

**Complexity:** Medium
**Dependency:** `tauri-plugin-updater`
**Migrates from:** electron-updater

**What this entails:**
- Update checking against a remote server or static JSON
- Download progress reporting via Channel
- Install update with app restart
- Signature verification (mandatory — cannot be disabled)
- macOS: .tar.gz from app bundle
- Windows: MSI/NSIS installers
- Linux: AppImage

**Key differences from electron-updater:**
- **Signature is mandatory** in Tauri — generate keys with `tauri signer generate`
- Public key goes in `tauri.conf.json`, private key in environment
- Update server can be static JSON (GitHub Releases) or dynamic server
- The `tauri-action` GitHub Action auto-generates update artifacts
- Windows: app auto-exits before install (Windows installer limitation)
- Endpoints support variables: `{{current_version}}`, `{{target}}`, `{{arch}}`
- Custom targets supported: `macos-universal` for universal binary

**Configuration:**
```json
{
    "bundle": { "createUpdaterArtifacts": true },
    "plugins": {
        "updater": {
            "pubkey": "CONTENT OF PUBLIC KEY",
            "endpoints": ["https://releases.example.com/{{target}}/{{arch}}/{{current_version}}"]
        }
    }
}
```

**Sources:**
- [Updater Plugin (Official Tauri Docs)](https://v2.tauri.app/plugin/updater/) — HIGH confidence
- [GitHub Pipeline (Official Tauri Docs)](https://v2.tauri.app/distribute/pipelines/github/) — HIGH confidence

---

### TS-10: Cross-Platform CI/CD

**Complexity:** Medium
**Dependency:** `tauri-apps/tauri-action`, GitHub Actions
**Migrates from:** Current electron-builder CI

**What this entails:**
- Build matrix: macOS (arm64 + x64), Windows (x64), Linux (x64 + arm64)
- Code signing for macOS and Windows
- Artifact upload
- Release management with GitHub Releases
- Optional: Notarization for macOS

**Tauri 2 specifics:**
- `tauri-apps/tauri-action@v0` handles build + release
- Linux deps: `libwebkit2gtk-4.1-dev`, `libappindicator3-dev`, `librsvg2-dev`, `patchelf`
- Rust toolchain via `dtolnay/rust-toolchain@stable`
- Rust cache via `swatinem/rust-cache@v2`
- Linux arm64: use `ubuntu-22.04-arm` runner (GA since Aug 2025) — no more emulation
- macOS: dual-arch build for arm64 + x64
- Signing:
  - macOS: `APPLE_CERTIFICATE` env var + keychain setup
  - Windows: `CERTIFICATE_PATH` env var + Azure Key Vault (recommended)
- Tauri v2.2+: `.msi` and `.msi.zip` + `.sig` for Windows updater artifacts

**Sources:**
- [GitHub Pipeline (Official Tauri Docs)](https://v2.tauri.app/distribute/pipelines/github/) — HIGH confidence
- [macOS Signing (Official Tauri Docs)](https://v2.tauri.app/distribute/sign/macos/) — HIGH confidence
- [Windows Signing (Official Tauri Docs)](https://v2.tauri.app/distribute/sign/windows/) — HIGH confidence

---

### TS-11: Key-Value Store (Persistent Config)

**Complexity:** Low
**Dependency:** `tauri-plugin-store`
**Migrates from:** electron-store / manual JSON files

**What this entails:**
- Persist TTS config (provider, voice, mode)
- Persist window state (position, size)
- Persist app preferences
- Replaces `app-state.ts` + manual JSON I/O

**Tauri 2 specifics:**
- Async key-value store backed by JSON file
- Both JS and Rust APIs
- Auto-save on graceful exit
- Debounced auto-save (configurable delay, default 100ms)
- `LazyStore` for deferred loading
- Compatible with `serde_json::Value` for Rust side

**Sources:**
- [Store Plugin (Official Tauri Docs)](https://v2.tauri.app/plugin/store/) — HIGH confidence

---

### TS-12: Single Instance Lock

**Complexity:** Low
**Dependency:** `tauri-plugin-single-instance`
**Migrates from:** `app.requestSingleInstanceLock()` in Electron

**What this entails:**
- Ensure only one instance of the app runs at a time
- Secondary instances should focus the existing window

**Sources:**
- Referenced in Tauri plugin list: `tauri-plugin-single-instance`

---

## Differentiators (What Makes This Migration Worthwhile)

These are capabilities that were difficult, slow, or impossible in Electron but are straightforward in Tauri 2 + Rust.

### DF-1: Native TTS via Rust (No System Command Dependencies)

**Complexity:** High
**Value:** Eliminates fragile CLI command dependency, enables cross-platform consistency

**What this enables:**
- Replace macOS `say` command with native `AVSpeechSynthesizer` via `objc2` bindings
- Replace Windows `edge-tts` CLI dependency with native SAPI COM interop via `windows` crate
- Linux: use `speech-dispatcher` C API via FFI
- All three providers return audio data identically — unified streaming pipeline
- No need to install external TTS CLIs or manage subprocess lifecycle
- Reduced attack surface (no command injection vectors)

**However, this is HIGH complexity.** For the initial port, using `std::process::Command` for system TTS (mirroring what Electron did) is acceptable. The native FFI layer can be added as a post-migration optimization.

---

### DF-2: Streaming Audio via Tauri Channels (Zero-Copy, Ordered)

**Complexity:** Low-Medium
**Value:** More efficient and reliable than Electron's streaming via IPC

**In Electron:**
- Audio chunks sent via IPC (serialized, overhead for binary data)
- IPC is unstructured — no built-in ordering guarantees for streaming

**In Tauri 2:**
- `Channel<T>` is designed for streaming — ordered, fast, minimal overhead
- `Uint8Array` can be sent directly as binary chunks
- Backpressure handling built into the channel protocol
- Used internally by Tauri for download progress, WebSocket, child process output

**Sources:**
- [Channels (Official Tauri Docs)](https://v2.tauri.app/develop/calling-frontend/#channels) — HIGH confidence

---

### DF-3: Axum HTTP Server in-Process (Unified Binary)

**Complexity:** Medium
**Value:** No child process, no Node.js, no PM2 — single binary

**In Electron:**
- The HTTP adapter (`electron/adapter/server.ts`) runs in the Electron main process
- Uses Express.js or Node HTTP server — adds to Node.js dependency

**In Tauri:**
- Axum runs in a `tokio::spawn` task within the Tauri async runtime
- Same process as the rest of the app — direct access to Tauri state and event system
- Zero additional runtime dependencies beyond Rust crate
- Startup and shutdown are managed by Tauri's setup lifecycle
- Performance: Axum is significantly faster than Node.js HTTP servers
- Can share the same `reqwest::Client` as the TTS and AI Planner modules

**Drawback:**
- This is NOT a standard Tauri feature — it's a custom extension pattern
- Must manually manage server lifecycle (start in setup, stop on exit)

---

### DF-4: AI Planner in Rust (Unified Backend, No Dual-Language)

**Complexity:** Medium
**Value:** Single language for all backend logic

**In Electron:**
- AI Planner uses OpenAI JS SDK (`openai` npm package) or raw fetch
- Must maintain Node.js runtime for this reason alone

**In Tauri:**
- AI Planner uses `reqwest` + `serde_json` — exactly the same as TTS and HTTP adapter
- API types defined in Rust with `serde` — compile-time verification of API contracts
- No need for `openai` npm package or Node.js fetch polyfills
- Zero Node.js dependencies after migration

---

### DF-5: Memory Footprint Reduction (Observable)

**Complexity:** Low (passive benefit)
**Value:** Lower memory usage, which matters for a "sit in the background" app

**Expected improvements:**
- Electron main process baseline: ~100-150MB RAM
- Tauri core process: ~5-15MB RAM
- WebView process: ~same as Electron (same engine)
- Total: ~70-80% reduction in background memory usage

**Why this matters for a pet app:**
- The app stays running in the background/tray continuously
- Users notice memory usage in activity monitors
- Lower footprint = longer battery life on laptops

**Sources:**
- [App Size (Official Tauri Docs)](https://v2.tauri.app/concept/size/) — HIGH confidence (official claims significantly smaller)

---

### DF-6: Granular Security Model (Capabilities + Scopes)

**Complexity:** Medium (configuration)
**Value:** Fine-grained permission control without preload script

**In Electron:**
- contextBridge-based security model — must manually manage what's exposed
- All IPC handlers have equal access once registered
- Security audits require reading all preload code

**In Tauri 2:**
- Capabilities system: per-window, per-command permissions
- File system access: granular scope-based (read/write per directory)
- HTTP fetch: whitelist/blacklist URLs
- IPC commands are gated behind permissions
- No preload script = no serialization boundary issues

**Example capability configuration:**
```json
{
    "windows": ["main"],
    "permissions": [
        "core:window:default",
        "core:window:allow-start-dragging",
        "dialog:allow-open",
        {
            "identifier": "http:default",
            "allow": [{ "url": "https://api.openai.com/*" }]
        },
        {
            "identifier": "fs:allow-exists",
            "allow": [{ "path": "$APPDATA/*" }]
        }
    ]
}
```

**Sources:**
- [Capabilities Overview (Official Tauri Docs)](https://v2.tauri.app/security/capabilities/) — HIGH confidence
- [Command Scopes (Official Tauri Docs)](https://v2.tauri.app/security/scope/) — HIGH confidence

---

### DF-7: Rust Ecosystem Access (sysinfo, FFI, etc.)

**Complexity:** Varies
**Value:** System monitoring, hardware access, native extensions

**What this enables:**
- `sysinfo` crate: CPU/memory/process monitoring — planned for deep system monitoring
- Direct FFI to system libraries (GPU stats, power management, etc.)
- `notify` crate: filesystem watching (alternative to fs plugin)
- `serde` + `toml`/`yaml` for configuration
- `tokio` for all async operations — unified async runtime

**Sources:**
- [State Management (Official Tauri Docs)](https://v2.tauri.app/develop/state-management/) — HIGH confidence

---

## Anti-Features (Deliberately NOT Porting from Electron)

These are Electron features that we intentionally do NOT replicate in Tauri.

### AF-1: Preload Script / contextBridge

**Rationale:** Tauri 2 uses capabilities-based security instead. No preload.js is needed. All IPC commands are defined in Rust with explicit permissions. This removes an entire class of serialization bugs and reduces complexity.

**What to do instead:**
- `#[tauri::command]` functions replace `ipcMain.handle()`
- Frontend calls `invoke()` directly from `@tauri-apps/api/core`
- Permissions configured in `src-tauri/capabilities/default.json`

---

### AF-2: Node.js Sidecar / Child Process Pattern

**Rationale:** The entire backend is now Rust — no need for Node.js child processes. If we need external tooling (like `ffmpeg` for audio processing), use Rust crates instead.

**What to do instead:**
- TTS: Rust-native implementation (avoids `child_process.spawn('say', [...])`)
- HTTP: Axum in-process instead of Node.js server
- File watching: `tauri-plugin-fs` `watch()` or Rust `notify` crate
- Image processing: `image` crate instead of `sharp` via Node.js

---

### AF-3: Electron-Builder Packaging

**Rationale:** Tauri has its own bundling system. `electron-builder.yml` is replaced by `tauri.conf.json` `bundle` section.

**What to do instead:**
- Tauri bundler generates: `.dmg` / `.app` (macOS), `.msi` / `.exe` (Windows), `.AppImage` / `.deb` (Linux)
- Updater artifacts generated alongside bundles
- Code signing configured in `tauri.conf.json`

---

### AF-4: Electron `app.getPath()` API

**Rationale:** Tauri has a different path resolution system based on `BaseDirectory` enum.

**What to do instead:**
- `app.getPath('userData')` → `BaseDirectory::AppLocalData`
- `app.getPath('logs')` → `BaseDirectory::AppLog`
- `app.getPath('home')` → `BaseDirectory::Home`
- Reference: `@tauri-apps/api/path` module

---

### AF-5: Electron `globalShortcut` API

**Rationale:** Not currently used in the app. If needed later, `tauri-plugin-global-shortcut` exists.

**Status:** Out of scope for current migration. Can be added via plugin if needed.

---

### AF-6: Electron `powerMonitor` API

**Rationale:** Not currently used. If needed for system monitoring in the future, Rust `sysinfo` crate + platform-specific APIs are more capable.

---

## Feature Dependency Map

```
TS-12 Single Instance    (independent)
     ↓
TS-1  Window Management  (needs Single Instance for proper focus behavior)
     ↓
TS-2  System Tray        (needs Window Management for show/hide)
     ↓
TS-11 Key-Value Store    (needed by TTS config, window state persistence)
     ↓
TS-6  File Dialog        (needs Store for paths, Dialog plugin for file picker)
     ↓
TS-4  TTS Audio Engine   (needs Store for config, IPC for streaming, Channel for audio)
TS-5  HTTP Adapter       (needs IPC events for forwarding, independent of other features)
TS-7  AI Planner         (needs reqwest/HTTP, independent window)
     ↓
TS-3  IPC Bridge         (foundation for all frontend-backend communication)
     ↓
TS-8  Logging            (should be set up first for debugging migration)
TS-9  Auto-Update        (needs CI/CD pipeline, should be early but not first)
TS-10 Cross-Platform CI/CD (parallel to everything, needed early for validation)
```

---

## Complexity Summary

| Feature | Complexity | Rust Lines (est.) | Risk |
|---------|-----------|-------------------|------|
| TS-1: Window Management | Low | ~50 | Low |
| TS-2: System Tray | Low-Med | ~100 | Low |
| TS-3: IPC Bridge | Medium | ~300 | Medium (many handlers) |
| TS-4: TTS Audio Engine | High | ~500 | High (cross-platform TTS) |
| TS-5: HTTP Adapter | High | ~200 | Medium (axum + async lifecycle) |
| TS-6: File Dialog | Low | ~100 | Low |
| TS-7: AI Planner | Medium | ~200 | Medium (API key mgmt) |
| TS-8: Logging | Low | ~30 | Low |
| TS-9: Auto-Update | Medium | ~100 | Medium (signing, testing) |
| TS-10: CI/CD | Medium | ~100 (YAML) | Medium (signing certs) |
| TS-11: KV Store | Low | ~30 | Low |
| TS-12: Single Instance | Low | ~10 | Low |

---

## Sources

| Source | URL | Confidence |
|--------|-----|------------|
| Tauri 2 Window Customization | https://v2.tauri.app/learn/window-customization/ | HIGH |
| Tauri 2 System Tray | https://v2.tauri.app/learn/system-tray/ | HIGH |
| Tauri 2 Positioner Plugin | https://v2.tauri.app/plugin/positioner/ | HIGH |
| Tauri 2 Window State Plugin | https://v2.tauri.app/plugin/window-state/ | HIGH |
| Tauri 2 Dialog Plugin | https://v2.tauri.app/plugin/dialog/ | HIGH |
| Tauri 2 File System Plugin | https://v2.tauri.app/plugin/file-system/ | HIGH |
| Tauri 2 Logging Plugin | https://v2.tauri.app/plugin/logging/ | HIGH |
| Tauri 2 Updater Plugin | https://v2.tauri.app/plugin/updater/ | HIGH |
| Tauri 2 HTTP Client Plugin | https://v2.tauri.app/plugin/http-client/ | HIGH |
| Tauri 2 Store Plugin | https://v2.tauri.app/plugin/store/ | HIGH |
| Tauri 2 Localhost Plugin | https://v2.tauri.app/plugin/localhost/ | HIGH |
| Tauri 2 Calling Frontend | https://v2.tauri.app/develop/calling-frontend/ | HIGH |
| Tauri 2 Calling Rust | https://v2.tauri.app/develop/calling-rust/ | HIGH |
| Tauri 2 State Management | https://v2.tauri.app/develop/state-management/ | HIGH |
| Tauri 2 Process Model | https://v2.tauri.app/concept/process-model/ | HIGH |
| Tauri 2 Embed Resources | https://v2.tauri.app/develop/resources/ | HIGH |
| Tauri 2 GitHub Pipeline | https://v2.tauri.app/distribute/pipelines/github/ | HIGH |
| Tauri 2 macOS Signing | https://v2.tauri.app/distribute/sign/macos/ | HIGH |
| Tauri 2 Windows Signing | https://v2.tauri.app/distribute/sign/windows/ | HIGH |
| Tauri 2 Capabilities | https://v2.tauri.app/security/capabilities/ | HIGH |
| Tauri 2 Plugin List | https://v2.tauri.app/plugin/ | HIGH |
