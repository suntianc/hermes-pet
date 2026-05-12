#![allow(dead_code, unused_imports)]

use std::sync::Mutex;

use tauri::Manager;

mod adapter;
mod ai;
mod commands;
mod error;
mod logging;
mod models;
mod state;
mod tray;
mod tts;
mod window;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(log::LevelFilter::Info)
                .target(tauri_plugin_log::Target::new(
                    tauri_plugin_log::TargetKind::LogDir {
                        file_name: Some("vivipet.log".into()),
                    },
                ))
                .build(),
        )
        .plugin(tauri_plugin_positioner::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            let _ = app.get_webview_window("main").map(|window| {
                let _ = window.show();
                let _ = window.set_focus();
            });
        }))
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(Mutex::new(state::AppState::new()))
        .setup(|app| {
            logging::init();

            tracing::info!("ViviPet Tauri app starting");

            // Load persisted TTS config from tauri-plugin-store
            if let Err(e) = load_tts_config(app) {
                tracing::warn!("Could not load TTS config from store: {e}");
            }

            // Load persisted AI planner config from tauri-plugin-store
            if let Err(e) = load_ai_config(app) {
                tracing::warn!("Could not load AI config from store: {e}");
            }

            // Ensure models directory exists on startup
            if let Err(e) = models::get_models_dir(&app.handle()) {
                tracing::warn!("Could not create models directory: {e}");
            }

            window::setup_window(app)?;
            tray::build_tray(app)?;

            // ── Start Adapter HTTP Server ──────────────────────────────────
            let handle = app.handle().clone();
            let lifecycle = adapter::lifecycle::AdapterLifecycle::new();
            let shutdown_signal = lifecycle.shutdown_signal();

            // Store lifecycle in AppState for later cancellation on Exit
            let state_lock = app.state::<Mutex<state::AppState>>();
            let guard = state_lock.lock().expect("AppState lock poisoned during adapter setup");
            guard.adapter_lifecycle.lock().expect("adapter_lifecycle lock poisoned").replace(lifecycle);
            drop(guard);

            // Spawn axum server on Tauri's shared Tokio runtime
            tauri::async_runtime::spawn(async move {
                let port = adapter::start_server(handle, shutdown_signal).await;
                tracing::info!("[Adapter] Server started on port {}", port);
            });

            tracing::info!("ViviPet Tauri app setup complete");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::greet,
            commands::window::set_ignore_mouse_events,
            commands::window::begin_drag,
            commands::window::get_window_position,
            commands::window::set_window_size,
            commands::window::set_size_anchored,
            commands::window::update_model_names,
            commands::tts::tts_speak,
            commands::tts::tts_stop,
            commands::tts::tts_get_config,
            commands::tts::tts_set_config,
            commands::tts::tts_get_voices,
            commands::models::model_list,
            commands::models::model_import,
            commands::models::model_refresh_scan,
            commands::models::model_remove,
            commands::ai::ai_plan,
            commands::ai::ai_get_config,
            commands::ai::ai_set_config,
            commands::ai::ai_test_connection,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            if let tauri::RunEvent::Exit = event {
                // Graceful shutdown of adapter server
                let state_lock = app_handle.state::<Mutex<state::AppState>>();
                let guard = match state_lock.lock() {
                    Ok(g) => g,
                    Err(_) => return,
                };
                let lc_guard = guard.adapter_lifecycle.lock().expect("adapter_lifecycle lock poisoned");
                if let Some(lifecycle) = lc_guard.as_ref() {
                    lifecycle.shutdown();
                    tracing::info!("[Adapter] Server shut down gracefully");
                }
                drop(lc_guard);
                drop(guard);
            }
        });
}

/// Load TTS config from tauri-plugin-store on startup.
/// Falls back to defaults if store key doesn't exist or deserialization fails.
fn load_tts_config(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    use tauri_plugin_store::StoreExt;

    let store = app.store("settings.json")?;
    if let Some(value) = store.get("tts_config") {
        let config: tts::config::TTSConfig = serde_json::from_value(value.clone())?;
        let state = app.state::<Mutex<state::AppState>>();
        let mut guard = state.lock().map_err(|e| format!("Lock: {e}"))?;
        guard.tts_config = config;
        tracing::info!("Loaded TTS config from store");
    }
    Ok(())
}

/// Load AI planner config from tauri-plugin-store on startup.
/// Falls back to defaults if store key doesn't exist or deserialization fails.
fn load_ai_config(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    use tauri_plugin_store::StoreExt;

    let store = app.store("settings.json")?;
    if let Some(value) = store.get("ai_config") {
        let config: ai::AiConfig = serde_json::from_value(value.clone())?;
        let state = app.state::<Mutex<state::AppState>>();
        let mut guard = state.lock().map_err(|e| format!("Lock: {e}"))?;
        guard.ai_config = config.clone();
        guard.ai_planner = ai::AiPlanner::new(config);
        tracing::info!("Loaded AI planner config from store");
    }
    Ok(())
}
