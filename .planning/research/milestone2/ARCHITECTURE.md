# Tauri 2 + Rust Architecture: Hermes DeskPet

**Domain:** Tauri 2 desktop application architecture
**Researched:** 2026-05-09
**Overall confidence:** HIGH (verified against official Tauri 2 docs)

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────┐
│                  WebView Process                      │
│  React 19 + Vite 5 + TypeScript (unchanged)           │
│                                                        │
│  ┌─────────────┐  ┌──────────┐  ┌──────────────────┐  │
│  │ PetStage     │  │ Speech   │  │ StreamingAudio   │  │
│  │ RiveRenderer │  │ Bubble   │  │ Player           │  │
│  └──────┬───────┘  └──────────┘  └────────┬─────────┘  │
│         │                                  │           │
│  ┌──────┴──────────────────────────────────┴────────┐  │
│  │             @tauri-apps/api Layer                 │  │
│  │  invoke()  |  Channel  |  listen()  |  emit()    │  │
│  └──────────────────────┬───────────────────────────┘  │
│                         │ IPC (webview message passing) │
├─────────────────────────┼────────────────────────────┤
│                  Core Process (Rust)                   │
│                         │                             │
│  ┌──────────────────────┴──────────────────────────┐  │
│  │              Tauri Runtime (tauri)               │  │
│  │  ┌───────────┐ ┌──────────┐ ┌────────────────┐ │  │
│  │  │ Commands  │ │ Events   │ │ State (Mutex)  │ │  │
│  │  │ Handler   │ │ Emitter  │ │ Management     │ │  │
│  │  └─────┬─────┘ └────┬─────┘ └────────────────┘ │  │
│  └────────┼─────────────┼──────────────────────────┘  │
│           │             │                              │
│  ┌────────┴─────────────┴──────────────────────────┐  │
│  │               Application Modules                 │  │
│  │                                                   │  │
│  │  ┌──────────────┐  ┌────────────┐                 │  │
│  │  │  tts/         │  │  adapter/  │  ┌───────────┐ │  │
│  │  │  ─ TTSManager │  │  ─ server  │  │ai_planner/│ │  │
│  │  │  ─ providers  │  │  ─ protocol│  │ ─ openai  │ │  │
│  │  │  ─ streaming  │  │  ─ normalize│  │ ─ planner │ │  │
│  │  └──────┬───────┘  └──────┬─────┘  └───────────┘ │  │
│  │         │                 │                        │  │
│  │  ┌──────┴─────────────────┴──────────────────┐   │  │
│  │  │        model_manager/                       │   │  │
│  │  │  ─ .riv file scanning                      │   │  │
│  │  │  ─ model registry management                │   │  │
│  │  │  ─ custom protocol (vivipet-assets://)      │   │  │
│  │  └────────────────────────────────────────────┘   │  │
│  │                                                   │  │
│  │  ┌──────────────┐  ┌────────────────────────┐   │  │
│  │  │  tray/        │  │  window/               │   │  │
│  │  │  ─ TrayIcon   │  │  ─ frameless+transparent│   │  │
│  │  │  ─ menu mgmt  │  │  ─ always-on-top       │   │  │
│  │  │  ─ event      │  │  ─ drag+resize         │   │  │
│  │  │    handlers   │  │  ─ bottom-right anchor │   │  │
│  │  └──────────────┘  └────────────────────────┘   │  │
│  └───────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

**Key architectural insight:** Tauri 2 is a single-process Rust application (the Core Process) that spawns one or more WebView processes. All Rust code runs in one process with a shared Tokio async runtime. There is no Node.js/Electron-style "main process" separation — Rust IS the main process. The WebView is purely a rendering surface.

---

## Directory Structure

```
src-tauri/
├── Cargo.toml                    # Dependencies + features
├── build.rs                      # tauri_build::build()
├── tauri.conf.json               # Tauri config (window, bundle, security)
├── capabilities/
│   └── default.json              # Command permissions for windows
├── icons/
│   ├── icon.png
│   ├── icon.icns
│   └── icon.ico
├── src/
│   ├── main.rs                   # Desktop entry: calls lib::run()
│   ├── lib.rs                    # Tauri builder setup, plugin registration
│   ├── commands/
│   │   ├── mod.rs                # Re-exports all command modules
│   │   ├── tts.rs                # TTS commands (speak, stop, config)
│   │   ├── window.rs             # Window commands (drag, resize, position)
│   │   ├── model.rs              # Model commands (import, scan, list)
│   │   ├── adapter.rs            # Adapter commands (capabilities query)
│   │   └── ai.rs                 # AI planner commands (plan, explain)
│   ├── tts/
│   │   ├── mod.rs                # TTS module root
│   │   ├── manager.rs            # Queue-based TTS engine (FIFO)
│   │   ├── config.rs             # Config types + persistence
│   │   ├── error.rs              # TTS-specific error types
│   │   ├── system.rs             # macOS say / edge-tts / platform system TTS
│   │   ├── local.rs              # HTTP streaming to local TTS service
│   │   └── cloud.rs              # OpenAI / ElevenLabs / Azure / custom API
│   ├── adapter/
│   │   ├── mod.rs                # Adapter module root
│   │   ├── server.rs             # Axum HTTP server (port 18765)
│   │   ├── protocol.rs           # Event schema types + serde
│   │   ├── normalize.rs          # Event normalization (agent → pet state)
│   │   └── policy.rs             # Rule/ai/hybrid behavior dispatch
│   ├── ai_planner/
│   │   ├── mod.rs
│   │   ├── openai.rs             # OpenAI API client (reqwest)
│   │   └── planner.rs            # Rule + AI behavior planning logic
│   ├── model_manager/
│   │   ├── mod.rs
│   │   ├── registry.rs           # Model registry (built-in + user)
│   │   ├── scanner.rs            # File/directory scanning for .riv files
│   │   ├── importer.rs           # Import from .riv / .zip / file dialog
│   │   └── protocol.rs           # Custom vivipet-assets:// protocol handler
│   ├── tray/
│   │   ├── mod.rs                # Tray icon builder + menu setup
│   │   └── handlers.rs           # Menu event handlers (show/hide, size, TTS)
│   ├── window/
│   │   ├── mod.rs                # Window creation + config
│   │   └── position.rs           # Bottom-right anchor logic
│   ├── error.rs                  # Unified error type (thiserror + serde)
│   ├── state.rs                  # Application-wide state struct
│   └── logging.rs                # Tracing subscriber setup
└── binaries/                     # External binaries (optional sidecars)
```

**Rationale:** Module-per-domain organization (not a flat `commands.rs`). Each domain module is self-contained with its own submodules. The `commands/` directory is a thin dispatch layer — each file contains only `#[tauri::command]` annotated functions that delegate to the corresponding domain module. This keeps cross-domain coupling minimal.

---

## Component Boundaries & Responsibilities

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| **WebView** | Rive rendering, UI, audio playback | `@tauri-apps/api` invoke/events/channels |
| **Commands** | IPC dispatch frontend → Rust | All domain modules |
| **TTS Manager** | Text-to-speech queue, provider dispatch, chunking | System/local/cloud providers |
| **Adapter Server** | Axum HTTP server for external Agent events | External agents (curl), AppHandle → emit pet events |
| **AI Planner** | OpenAI API calls, behavior policy | reqwest → OpenAI |
| **Model Manager** | .riv file scanning, import, registry | File system |
| **Tray** | System tray icon + menu | Window show/hide, TTS toggle, model switching |
| **Window Manager** | Window creation, positioning, drag/resize | WebView window API |
| **State** | Global app state (Mutex-protected) | All domain modules (read/write via State) |

### Communication Flow Matrix

```
                ┌──────────────────────────────────────────────┐
                │               WebView (Frontend)              │
                │                                                │
  invoke() ─────┼──►  Commands  ──► Domain Modules              │
                │                                                │
  ◄────────────┼──  Result<_, Error> (serialized)              │
                │                                                │
  listen() ◄───┼──  Event system (Rust → Frontend push)        │
                │     "pet:event", "tts:state", "model:update"  │
                │                                                │
  Channel ◄────┼──  TTS audio chunks (ordered, binary)         │
                │                                                │
                └──────────────────────────────────────────────┘

  External Agent (curl)
       │
       ▼
  Adapter Server (axum :18765) ──emit("pet:event")──► WebView
       │
       └── AppHandle.state.tts.speak(text) ──► TTS Manager
```

---

## IPC Strategy: When to Use Each Mechanism

### 1. `invoke()` (Request-Response)
**Use for:** Mutations, queries, one-shot operations

| Operation | Command |
|-----------|---------|
| Speak text | `tts_speak` |
| Stop TTS | `tts_stop` |
| Get TTS config | `tts_get_config` |
| Set TTS config | `tts_set_config` |
| Get available voices | `tts_get_voices` |
| List models | `model_list` |
| Import model | `model_import` |
| Plan action | `ai_plan` |
| Get window state | `window_get_state` |
| Resize window | `window_resize` |
| Query adapter status | `adapter_get_status` |

**Frontend pattern:**
```typescript
import { invoke } from '@tauri-apps/api/core';

const voices = await invoke<Voice[]>('tts_get_voices', { provider: 'system' });
```

### 2. `Channel` (Streaming Data)
**Use for:** High-throughput ordered data, binary payloads

| Data Stream | Channel Usage |
|-------------|---------------|
| TTS audio chunks | `Channel<AudioChunk>` — each chunk is `{ data: Uint8Array, seq: number }` |
| TTS playback state | `Channel<TtsState>` — `playing | idle | error` |
| Model scan progress | `Channel<ScanProgress>` — file-by-file progress |

**This replaces:** The old Electron IPC `pet:tts:audioChunk` pattern. Tauri 2 Channels are specifically designed for this use case — they are ordered, efficient for binary data, and avoid JSON serialization overhead for large payloads.

**Frontend pattern:**
```typescript
import { invoke, Channel } from '@tauri-apps/api/core';

const channel = new Channel<AudioChunk>();
channel.onmessage = (chunk) => {
  streamingAudioPlayer.enqueue(chunk.data);
};

await invoke('tts_speak', { text: 'Hello world', onChunk: channel });
```

### 3. `emit()` / `listen()` (Push Events)
**Use for:** Unsolicited notifications from Rust → Frontend

| Event | Direction | Payload |
|-------|-----------|---------|
| `pet:event` | Adapter → WebView | `{ phase, text, action }` |
| `tts:state` | TTS → WebView | `{ state: "playing" | "idle" | "error" }` |
| `model:update` | Model Manager → WebView | `{ action: "imported" | "removed", name }` |
| `tray:action` | Tray → WebView (via commands) | `{ action: "toggle_tts" | "show" | "hide" }` |
| `adapter:status` | Adapter → WebView | `{ running: bool, port: u16 }` |

**Frontend pattern:**
```typescript
import { listen } from '@tauri-apps/api/event';

const unlisten = await listen<PetEvent>('pet:event', (event) => {
  applyPetStateEvent(event.payload);
});
```

### IPC Decision Matrix

| Criterion | invoke() | Channel | emit() / listen() |
|-----------|----------|---------|-------------------|
| Request-response? | ✅ | ❌ | ❌ |
| Streaming data? | ❌ | ✅ | ⚠️ (JSON only, not ordered) |
| Binary payloads? | ⚠️ (Response<T>) | ✅ (Uint8Array) | ❌ (JSON only) |
| Push from Rust? | ❌ | ✅ | ✅ |
| Type safety | ✅ (serde) | ✅ (tagged enum) | ⚠️ (JSON, manual typing) |
| Throughput | Low-Med | High | Low-Med |
| Ordering | N/A | ✅ Guaranteed | ❌ Not guaranteed |

---

## State Management Architecture

### The Global AppState

```rust
// src/state.rs
use std::sync::Mutex;

pub struct AppState {
    pub tts_config: Mutex<TtsConfig>,           // Persisted TTS configuration
    pub tts_manager: Mutex<TtsManager>,          // TTS engine (queue, providers)
    pub adapter_state: Mutex<AdapterState>,      // HTTP server running state
    pub model_registry: Mutex<ModelRegistry>,    // Built-in + user models
    pub ai_planner: Mutex<AiPlanner>,            // AI behavior planner state
    pub window_state: Mutex<WindowState>,        // Current window size/position
}
```

### Registration in `lib.rs`

```rust
// src/lib.rs
use std::sync::Mutex;

pub fn run() {
    tauri::Builder::default()
        .manage(AppState {
            tts_config: Mutex::new(TtsConfig::load_or_default()),
            tts_manager: Mutex::new(TtsManager::new()),
            adapter_state: Mutex::new(AdapterState::default()),
            model_registry: Mutex::new(ModelRegistry::new()),
            ai_planner: Mutex::new(AiPlanner::new()),
            window_state: Mutex::new(WindowState::default()),
        })
        .invoke_handler(tauri::generate_handler![
            commands::tts::tts_speak,
            commands::tts::tts_stop,
            // ... all commands
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

### Rules for State Management

1. **Always use `std::sync::Mutex`** (not `tokio::sync::Mutex`) for app state. Tauri docs explicitly recommend `std::sync::Mutex` for shared state because lock contention is low — we lock, read/write, and release quickly. `tokio::sync::Mutex` is only needed if you hold the lock across `.await` points.

2. **No `Arc` needed.** Tauri's `State<T>` already wraps in `Arc` internally. Never write `Arc<Mutex<T>>` — just pass `Mutex<T>` to `.manage()`.

3. **Minimize lock scope.** Lock the mutex, do the work, release. Avoid holding locks across async boundaries.

4. **Type aliases prevent mismatches.** The most common runtime panic in Tauri is using `State<'_, AppState>` instead of `State<'_, Mutex<AppState>>`. Use type aliases:

```rust
type AppStateGuard = Mutex<AppState>;
```

5. **Access from outside commands** via `app.state::<Mutex<AppState>>()` on any `Manager` implementor (AppHandle, Window, App).

6. **Spawned tasks get `AppHandle`.** For long-running tasks (TTS streaming, HTTP server), clone `AppHandle` (it's cheap — `Arc` internally) and pass into the spawned task. Access state via `handle.state::<Mutex<T>>()`.

---

## Long-Running Audio Streaming: Channel Architecture

This is the most architecturally interesting component. The TTS flow in Tauri 2 uses Channels, not events.

### Data Flow

```
Frontend invoke("tts_speak", { text, voice, onChunk: Channel })
  │
  ▼
Tauri Command (commands/tts.rs)
  │
  ▼
TTSManager.speak(text, voice, channel)
  │
  ├── 1. Text splitting (500 chars/chunk by sentence → comma → hard)
  ├── 2. Queue management (FIFO, dedup)
  │
  ▼
Stream Provider (system/local/cloud)
  │
  ▼
AsyncGenerator<AudioChunk>
  │
  ▼
for each chunk:
  ├── channel.send(AudioChunk { data, seq, sample_rate })
  ├── app.emit("tts:state", { state: "playing" })
  │
  ▼
(TTS completes)
  ├── channel.send(TtsEvent::Finished { duration })
  └── app.emit("tts:state", { state: "idle" })
```

### Channel Type Definitions

```rust
// Rust side — in tts/mod.rs
#[derive(Clone, Serialize)]
#[serde(tag = "event", content = "data")]
pub enum TtsStreamEvent {
    AudioChunk {
        data: Vec<u8>,        // PCM/Opus audio data
        seq: u32,             // Ordered sequence number
        sample_rate: u32,     // For Web Audio API setup
    },
    StateChange {
        state: TtsPlaybackState,  // "playing" | "paused" | "idle"
    },
    Finished {
        total_chunks: u32,
        duration_ms: u64,
    },
    Error {
        message: String,
        recoverable: bool,
    },
}

#[tauri::command]
pub async fn tts_speak(
    app: AppHandle,
    text: String,
    voice: Option<String>,
    on_event: Channel<TtsStreamEvent>,
) -> Result<(), TtsError> {
    let state = app.state::<Mutex<AppState>>();
    let mut manager = state.lock().unwrap().tts_manager.clone();
    
    // spawn TTS in background task, channel sends chunks
    // ... (see Multi-threading section for spawn pattern)
    Ok(())
}
```

### Critical Design Choices

1. **Use `Channel` not `emit()` for audio data.** Rationale:
   - Channels are ordered — crucial for audio where chunk order matters
   - Channels handle binary (`Vec<u8>`) without base64 overhead
   - Events serialize to JSON string — adds ~33% size overhead for binary
   - Channels are designed for "streaming operations such as download progress, child process output and WebSocket messages" (Tauri docs)

2. **Use `emit()` for status changes, not audio.** State transitions (`playing → idle`) are low-frequency and benefit from the global broadcast nature of events (all listeners get them).

3. **The audio player code in the WebView (`StreamingAudioPlayer.ts`) receives chunks from `Channel.onmessage`**, appends them to a buffer, and decodes/plays via Web Audio API as before — no changes needed to the player logic.

---

## Embedding Axum HTTP Server

### Lifecycle Strategy

The adapter HTTP server (port 18765) runs on the same Tokio runtime as Tauri. It must be started during `setup()` and shut down when the app exits.

```rust
// src/adapter/server.rs
use std::sync::atomic::{AtomicBool, Ordering};
use std::net::SocketAddr;
use tokio::net::TcpListener;

pub struct AdapterServer {
    pub port: u16,
    shutdown_token: tokio_util::sync::CancellationToken,
}

impl AdapterServer {
    pub async fn start(app_handle: AppHandle) -> Result<Self, AdapterError> {
        let addr = SocketAddr::from(([127, 0, 0, 1], 18765));
        let listener = TcpListener::bind(addr).await?;
        let actual_port = listener.local_addr()?.port();
        
        let cancel = tokio_util::sync::CancellationToken::new();
        let cancel_spawn = cancel.clone();
        
        let app = axum::Router::new()
            .route("/adapter", axum::routing::post(handle_adapter_request))
            .route("/adapter/capabilities", axum::routing::get(handle_capabilities))
            .with_state(app_handle);  // AppHandle is shared state
        
        // Spawn axum on Tauri's Tokio runtime
        tokio::spawn(async move {
            axum::serve(listener, app)
                .with_graceful_shutdown(async {
                    cancel_spawn.cancelled().await;
                })
                .await
                .ok();
        });
        
        log::info!("Adapter server started on port {}", actual_port);
        
        Ok(Self {
            port: actual_port,
            shutdown_token: cancel,
        })
    }
    
    pub fn shutdown(&self) {
        self.shutdown_token.cancel();
    }
}
```

### Registration in `lib.rs`

```rust
// src/lib.rs setup()
.setup(|app| {
    let app_handle = app.handle().clone();
    
    // Store adapter state
    let adapter = app_handle.state::<Mutex<AppState>>();
    
    // Start adapter server
    tauri::async_runtime::spawn(async move {
        match adapter::server::AdapterServer::start(app_handle).await {
            Ok(server) => {
                // Store for later shutdown — handled by Drop
            }
            Err(e) => log::error!("Failed to start adapter: {e}"),
        }
    });
    
    Ok(())
})
```

### Port Conflict Strategy

- Try port 18765 first
- If occupied, try 18765–18800 incrementally
- Emit `adapter:status` event with actual port
- Store port in `AppState` so frontend can query it

### Why Axum Shares the Tauri Runtime

Tauri 2 uses `tokio` internally. Calling `tauri::async_runtime::spawn()` runs on the **same Tokio runtime** that Tauri uses. This means:
- No separate thread pool needed
- Axum tasks share the same event loop
- Graceful shutdown integrates with Tauri lifecycle
- AppHandle can be passed directly as axum state

**Do NOT** create a separate `#[tokio::main]` runtime — this will conflict with Tauri's runtime. Always use `tauri::async_runtime::spawn()`.

---

## Tray Architecture

```rust
// src/tray/mod.rs
use tauri::tray::TrayIconBuilder;
use tauri::menu::{Menu, MenuBuilder, MenuItemBuilder, SubmenuBuilder};

pub fn build_tray(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let show_hide = MenuItemBuilder::with_id("show_hide", "Hide")
        .build(app)?;
    let separator = tauri::menu::PredefinedMenuItem::separator(app)?;
    let tts_menu = build_tts_submenu(app)?;
    let model_menu = build_model_submenu(app)?;
    let quit = MenuItemBuilder::with_id("quit", "Quit")
        .build(app)?;
    
    let menu = MenuBuilder::new(app)
        .item(&show_hide)
        .item(&separator)
        .item(&tts_menu)
        .item(&model_menu)
        .item(&quit)
        .build()?;
    
    TrayIconBuilder::new()
        .icon(app.default_window_icon().unwrap().clone())
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(handlers::on_tray_menu_event)
        .build(app)?;
    
    Ok(())
}
```

### Tray Menu Structure

```
├── Show/Hide (toggles)
├── Always on Top (toggle)
├── Mouse Passthrough (toggle)
├── ────────────
├── TTS
│   ├── Enable TTS (toggle)
│   ├── Source
│   │   ├── System
│   │   ├── Local
│   │   └── Cloud
│   └── Settings...
├── Model
│   ├── Switch Model
│   │   ├── Model A  (radio)
│   │   ├── Model B  (radio)
│   │   └── ...
│   └── Import Model...
├── Size
│   ├── Small
│   ├── Medium
│   └── Large
├── ────────────
└── Quit
```

### Dynamic Menu Updates

Tray menus in Tauri 2 support dynamic updates:
- `MenuItem::set_text()` — update label text
- `MenuItem::set_enabled()` — enable/disable
- `Submenu::set_items()` — replace items (for dynamic model list)

The model list must be rebuilt on `model:update` event. Store the `tray_id` in AppState and use `app.tray_by_id("main")` to access and modify.

---

## Multi-Threading & Async Patterns

### Rule Summary

| Pattern | When to Use | Mechanism |
|---------|-------------|-----------|
| **Sync command** | Simple query, fast I/O | `#[tauri::command]` (runs on main thread) |
| **Async command** | Network calls, file I/O > 1ms | `#[tauri::command] async fn` (spawned on Tokio) |
| **Blocking task** | CPU-heavy work, sync syscalls | `tauri::async_runtime::spawn_blocking()` |
| **Long-running task** | Server, polling loop | `tauri::async_runtime::spawn()` with `AppHandle` |
| **Timed interval** | Periodic state check | `tokio::spawn()` with `tokio::time::interval` |

### TTS Streaming — Async Spawn Pattern

```rust
#[tauri::command]
pub async fn tts_speak(
    app: AppHandle,
    text: String,
    voice: Option<String>,
    on_event: Channel<TtsStreamEvent>,
) -> Result<(), TtsError> {
    let app2 = app.clone();
    
    // Spawn long-running TTS on Tokio, don't block the command response
    tauri::async_runtime::spawn(async move {
        let state = app2.state::<Mutex<AppState>>();
        let provider = {
            let guard = state.lock().unwrap();
            guard.tts_config.active_provider.clone()
        };
        
        match provider.stream_tts(&text, voice.as_deref()).await {
            Ok(mut stream) => {
                let mut seq = 0u32;
                while let Some(chunk) = stream.next().await {
                    match chunk {
                        Ok(audio) => {
                            let _ = on_event.send(TtsStreamEvent::AudioChunk {
                                data: audio.data,
                                seq,
                                sample_rate: audio.sample_rate,
                            });
                            seq += 1;
                        }
                        Err(e) => {
                            let _ = on_event.send(TtsStreamEvent::Error {
                                message: e.to_string(),
                                recoverable: true,
                            });
                        }
                    }
                }
                let _ = on_event.send(TtsStreamEvent::Finished {
                    total_chunks: seq,
                    duration_ms: 0,
                });
                let _ = app2.emit("tts:state", serde_json::json!({"state": "idle"}));
            }
            Err(e) => {
                let _ = on_event.send(TtsStreamEvent::Error {
                    message: e.to_string(),
                    recoverable: false,
                });
            }
        }
    });
    
    Ok(()) // Return immediately — streaming happens in background
}
```

### System TTS (Blocking)

System TTS (e.g., macOS `say` command) involves running a child process. Use `spawn_blocking` for this:

```rust
// In tts/system.rs
pub fn speak_system(text: &str) -> Result<Child, TtsError> {
    // This is a sync, blocking call — runs in spawn_blocking
    std::process::Command::new("say")
        .arg(text)
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(TtsError::SystemCommandError)
}
```

Invoked via:
```rust
let child = tauri::async_runtime::spawn_blocking(move || {
    system::speak_system(&text)
}).await??;
```

---

## Error Handling Architecture

### Unified Error Type

```rust
// src/error.rs
use std::fmt;

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    // TTS errors
    #[error("TTS error: {0}")]
    Tts(String),
    #[error("TTS provider '{0}' not available")]
    TtsProviderUnavailable(String),
    
    // Adapter errors
    #[error("Adapter server error: {0}")]
    Adapter(#[from] std::io::Error),
    
    // AI Planner errors
    #[error("AI planner error: {0}")]
    AiPlanner(String),
    #[error("OpenAI API error: {0}")]
    OpenAi(#[from] reqwest::Error),
    
    // Model management errors
    #[error("Model error: {0}")]
    Model(String),
    #[error("File I/O error: {0}")]
    Io(#[from] std::io::Error),
    
    // Window errors
    #[error("Window error: {0}")]
    Window(String),
}

// Required for Tauri command errors — must be serializable
impl serde::Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(self.to_string().as_ref())
    }
}
```

### Frontend Error Handling

```typescript
type AppError = string; // Serialized error message from Rust

try {
  await invoke('tts_speak', { text: 'hello' });
} catch (error: AppError) {
  // "TTS error: network timeout" or "TTS provider 'cloud' not available"
  console.error(error);
}
```

### Module-Specific Error Types

Each domain module may define its own error type that implements `Into<AppError>`:

```rust
// tts/error.rs
#[derive(Debug, thiserror::Error)]
pub enum TtsError {
    #[error("network request failed: {0}")]
    Network(#[from] reqwest::Error),
    #[error("provider returned error: {status} {body}")]
    ProviderResponse { status: u16, body: String },
    #[error("audio decoding failed: {0}")]
    AudioDecode(String),
}

impl From<TtsError> for AppError {
    fn from(e: TtsError) -> Self {
        AppError::Tts(e.to_string())
    }
}
```

### Key Error Handling Rules

1. **Never use `String` as error type in commands** — use `AppError` for proper discrimination.
2. **`serde::Serialize` must be implemented on error types** — Tauri requires it for `Result` in commands.
3. **Use `thiserror` for error derivation** — standard Rust ecosystem practice, integrates with `Display`.
4. **Frontend receives serialized error** — the TS side gets a string (or structured object if you implement `Serialize` with discriminated unions).
5. **Consider `#[serde(tag = "kind", content = "message")]`** if you want the frontend to discriminate error types programmatically.

---

## Plugin Architecture

### When to Write a Custom Plugin

Tauri 2 has a first-class plugin system with lifecycle hooks, permissions, and JS API bindings. However, for this project, **inline commands are the right choice** for most cases.

| Scenario | Inline Command | Custom Plugin |
|----------|---------------|---------------|
| Single-app feature (TTS, AI Planner) | ✅ Preferred | ❌ Over-engineering |
| Reusable across apps (model loading) | ✅ Acceptable | ⚠️ Consider if OSS |
| Needs permissions/capabilities isolation | ✅ Supported inline | ⚠️ Not needed |
| Needs mobile (iOS/Android) support | N/A | ✅ Plugin required |
| Needs lifecycle hooks (on_navigation) | ❌ Not possible | ✅ Plugin hooks |

**Decision: Use inline commands for everything.**

- TTS, AI Planner, Model Manager, Adapter are all app-specific
- No mobile support needed (desktop only)
- Permissions isolation via `capabilities/default.json` works for inline commands
- Plugin lifecycle hooks aren't needed — `setup()` in `lib.rs` covers initialization

### Official Plugins We Use

```toml
[dependencies]
# Cargo.toml additions
tauri = { version = "2", features = ["tray-icon"] }
tauri-plugin-log = "2"        # Structured logging (replaces electron-log)
tauri-plugin-dialog = "2"     # Native file dialogs (model import)
tauri-plugin-fs = "2"         # File system access (model scanning)
tauri-plugin-shell = "2"      # Platform shell for system TTS commands
tauri-plugin-positioner = "2" # Window positioning (bottom-right anchor)
tauri-plugin-updater = "2"    # Auto-update (replaces electron-updater)
tauri-plugin-store = "2"      # Persisted key-value store (TTS config)
```

### Plugin Registration Order

```rust
// src/lib.rs — ordered by dependency
tauri::Builder::default()
    .plugin(tauri_plugin_log::Builder::new().build())
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_shell::init())
    .plugin(tauri_plugin_store::Builder::default().build())
    .plugin(tauri_plugin_positioner::init())
    .plugin(tauri_plugin_updater::Builder::new().build())
    .setup(|app| { /* ... */ })
```

---

## Capabilities & Permissions

### `capabilities/default.json`

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "main-capability",
  "description": "Capability for the main pet window",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "core:window:default",
    "core:window:allow-set-size",
    "core:window:allow-set-position",
    "core:window:allow-set-always-on-top",
    "core:window:allow-show",
    "core:window:allow-hide",
    "core:window:allow-set-focus",
    "core:window:allow-start-dragging",
    "dialog:default",
    "fs:default",
    "fs:allow-read",
    "fs:allow-exists",
    "shell:default",
    "shell:allow-execute",
    "store:default",
    "log:default",
    "positioner:default",
    "updater:default"
  ]
}
```

### Custom Command Permissions

Custom commands are allowed by default. To restrict them, use `build.rs`:

```rust
// build.rs
fn main() {
    tauri_build::build();
}
```

Custom commands don't need explicit capabilities — they're available to all windows unless you use `AppManifest::commands()` in `build.rs` to restrict them.

---

## Build Order & Dependency Map

```
                    Phase 1: Foundation
                    ┌─────────────────┐
                    │ Tauri 2 init     │
                    │ tauri.conf.json  │
                    │ Window: frameless│
                    │ transparent      │
                    │ always-on-top    │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │ Tray Icon       │
                    │ Menu structure  │
                    │ Basic handlers  │
                    └────────┬────────┘
                             │
            ┌────────────────┼────────────────┐
            ▼                ▼                 ▼
    Phase 2: TTS    Phase 3: Adapter   Phase 4: Model
    ┌──────────┐    ┌─────────────┐    ┌────────────┐
    │ TTSConfig │    │ Axum server │    │ ModelReg   │
    │ TTSManager│    │ Protocol    │    │ Scanner    │
    │ Providers │    │ Normalize   │    │ Importer   │
    │ Channel   │    │ Policy      │    │ Protocol   │
    │ streaming │    └─────────────┘    └────────────┘
    └──────────┘
            │                 │
            └─────────────────┼────────────────┐
                              ▼                 ▼
                    Phase 5: AI Planner   Phase 6: IPC Adapter
                    ┌──────────────┐    ┌──────────────────┐
                    │ OpenAI       │    │ Frontend invoke  │
                    │ client       │    │ layer migration  │
                    │ Planner      │    │ Event migration  │
                    │ Rule engine  │    │ Channel migration │
                    └──────────────┘    └──────────────────┘
                              │                 │
                              └────────┬────────┘
                                       ▼
                              Phase 7: Polish
                              ┌──────────────┐
                              │ Logging      │
                              │ Auto-update  │
                              │ Cross-platform│
                              │ Cleanup      │
                              └──────────────┘
```

### Dependency Rules

1. **Phase 1 must be first** — everything depends on the Tauri window existing.
2. **Phase 2–4 can be parallel** — TTS, Adapter, and Model Manager have no interdependencies. They only depend on Phase 1 being complete.
3. **Phase 5 depends on Phase 4** — AI Planner needs model registry to resolve actions.
4. **Phase 6 depends on Phase 2–5** — IPC adapter layer (frontend-side) needs all Rust backends to be complete before the migration from `window.electronAPI` to `@tauri-apps/api` can be tested end-to-end.
5. **Phase 7 is final** — logging, updates, and cross-platform testing.

---

## Performance Considerations

| Concern | Tauri 2 Approach | Expected Improvement over Electron |
|---------|------------------|-----------------------------------|
| **Memory** | Single Rust process + WebView | 40-60% reduction (no Node.js runtime) |
| **CPU** | Native compiled Rust | 30-50% reduction (no V8 JIT overhead) |
| **Startup time** | Minimal binary (<5MB + WebView) | 2-3x faster (no Chromium spin-up) |
| **TTS latency** | Native system calls, async reqwest | Negligible difference at low volume |
| **Audio streaming** | Channel binary passthrough | Same (Web Audio API unchanged) |
| **Bundle size** | ~5MB + frontend assets | 90% reduction vs. Electron + Chromium |

### Critical Path: Lip Sync Latency

```
TTS provider → Rust channel → WebView Channel.onmessage → StreamingAudioPlayer → RMS
analysis → RiveRenderer.mouth_open input

Target: <200ms from provider output to Rive mouth animation
Risk: Channel serialization/deserialization adds ~5-15ms per chunk. Buffer size tuning is
critical. Target chunk size: ~16KB (~1 second of audio at 16kHz mono 16-bit PCM).
```

---

## Key Architectural Decisions

| Decision | Choice | Why |
|----------|--------|-----|
| Multi-process model | Single Rust process + one WebView | Tauri 2 architecture — simpler than Electron's 3-process model |
| State management | `std::sync::Mutex<T>` via `app.manage()` | Tauri docs recommend, no Arc needed, simpler than channels |
| TTS streaming | `Channel<TtsStreamEvent>` | Binary-capable, ordered, designed for streaming — vs. events which are JSON-only |
| Status broadcasting | `app.emit("tts:state", payload)` | Event system is fine for low-frequency broadcast messages |
| HTTP adapter | Embedded axum on shared Tokio runtime | One process, shared state, graceful shutdown — vs. sidecar |
| Error handling | Enum with serde::Serialize | Type discrimination, structured messages — vs. plain strings |
| Module organization | Per-domain commands/ directory | Separation of concerns vs. monolithic commands.rs |
| Custom plugins | Not needed for this project | All domain modules are app-specific; plugin overhead unwarranted |
| Frontend IPC layer | Incremental migration via adapter module | Wrap @tauri-apps/api behind same interface as old electronAPI |

---

## Sources

- **Tauri 2 Project Structure**: https://v2.tauri.app/start/project-structure/ (HIGH confidence)
- **Tauri Architecture**: https://v2.tauri.app/concept/architecture/ (HIGH confidence)
- **Process Model**: https://v2.tauri.app/concept/process-model/ (HIGH confidence)
- **Calling Rust from Frontend**: https://v2.tauri.app/develop/calling-rust/ (HIGH confidence)
- **Calling Frontend from Rust**: https://v2.tauri.app/develop/calling-frontend/ (HIGH confidence)
- **State Management**: https://v2.tauri.app/develop/state-management/ (HIGH confidence)
- **System Tray**: https://v2.tauri.app/learn/system-tray/ (HIGH confidence)
- **Plugin Development**: https://v2.tauri.app/develop/plugins/ (HIGH confidence)
- **Capabilities**: https://v2.tauri.app/security/capabilities/ (HIGH confidence)
- **Logging Plugin**: https://v2.tauri.app/plugin/logging/ (HIGH confidence)
- **Positioner Plugin**: https://v2.tauri.app/plugin/positioner/ (HIGH confidence)
- **Localhost Plugin**: https://v2.tauri.app/plugin/localhost/ (MEDIUM — alternative approach considered)
