use std::sync::Mutex;

use tauri::Manager;

mod commands;
mod error;
mod logging;
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
        .manage(Mutex::new(state::AppState::new()))
        .setup(|app| {
            logging::init();

            tracing::info!("ViviPet Tauri app starting");

            // Load persisted TTS config from tauri-plugin-store
            if let Err(e) = load_tts_config(app) {
                tracing::warn!("Could not load TTS config from store: {e}");
            }

            window::setup_window(app)?;
            tray::build_tray(app)?;

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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
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
