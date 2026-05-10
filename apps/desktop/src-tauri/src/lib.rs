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
        .manage(state::AppState::new())
        .setup(|app| {
            logging::init();

            tracing::info!("ViviPet Tauri app starting");
            tracing::warn!("This is a warning log message (Phase 1 test)");
            tracing::error!("This is an error log message (Phase 1 test) — not an actual error");

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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
