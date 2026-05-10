use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_positioner::WindowExt;

/// Main tray menu event handler.
/// Dispatches by MenuItem ID to the appropriate action.
pub fn on_tray_menu_event(app: &AppHandle, event: tauri::menu::MenuEvent) {
    let id = event.id().0.as_str();

    match id {
        // ---- Window visibility ----
        "show_hide" => {
            if let Some(window) = app.get_webview_window("main") {
                if window.is_visible().unwrap_or(false) {
                    let _ = window.hide();
                    tracing::info!("Window hidden via tray");
                } else {
                    let _ = window.show();
                    let _ = window.set_focus();
                    tracing::info!("Window shown via tray");
                }
            }
        }

        // ---- Window state toggles ----
        "always_on_top" => {
            if let Some(window) = app.get_webview_window("main") {
                let current = window.is_always_on_top().unwrap_or(true);
                let _ = window.set_always_on_top(!current);
                tracing::info!("Always on top: {}", !current);
            }
        }

        "mouse_passthrough" => {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_ignore_cursor_events(true);
                tracing::info!("Mouse passthrough toggled");
            }
        }

        // ---- Size presets ----
        "size_small" => {
            resize_pet(app, 0.7);
        }
        "size_medium" => {
            resize_pet(app, 1.0);
        }
        "size_large" => {
            resize_pet(app, 1.3);
        }

        // ---- Mouse Follow ----
        "mouse_follow" => {
            // Emit event to frontend — mouse follow is a frontend-side feature
            // that controls look_at polling in PetStage.
            let _ = app.emit(
                "pet:action",
                serde_json::json!({
                    "action": "mouseFollow:toggle"
                }),
            );
            tracing::info!("Mouse follow toggled");
        }

        // ---- TTS actions (placeholder, Phase 2 will implement) ----
        "tts_enable" => {
            tracing::info!("TTS enable toggle (Phase 2)");
        }
        "tts_source_system" | "tts_source_local" | "tts_source_cloud" => {
            let source = match id {
                "tts_source_system" => "system",
                "tts_source_local" => "local",
                "tts_source_cloud" => "cloud",
                _ => unreachable!(),
            };
            tracing::info!("TTS source selected: {source} (Phase 2)");
        }
        "tts_settings" => {
            tracing::info!("TTS settings requested (Phase 2)");
        }

        // ---- Model actions ----
        "import_model" => {
            tracing::info!("Model import requested via tray");
            match crate::models::import_model(app) {
                Ok(Some(config)) => {
                    tracing::info!("Model imported: {} ({})", config.name, config.id);
                    // Emit event to frontend so it can refresh its model list
                    let _ = app.emit("model:imported", serde_json::json!({
                        "id": config.id,
                        "name": config.name,
                    }));
                }
                Ok(None) => {
                    tracing::info!("Model import cancelled by user");
                }
                Err(e) => {
                    tracing::error!("Model import failed: {e}");
                }
            }
        }

        // ---- Quit ----
        "quit" => {
            tracing::info!("Quit via tray menu");
            app.exit(0);
        }

        _ => {
            tracing::warn!("Unknown tray menu event: {id}");
        }
    }
}

/// Resize the pet window by a scale factor.
/// base_size: 750×700, multiplied by scale_factor.
fn resize_pet(app: &AppHandle, scale: f64) {
    const BASE_WIDTH: f64 = 750.0;
    const BASE_HEIGHT: f64 = 700.0;

    if let Some(window) = app.get_webview_window("main") {
        let new_width = (BASE_WIDTH * scale).max(100.0);
        let new_height = (BASE_HEIGHT * scale).max(100.0);

        // Set new size, keeping bottom-right anchored
        let _ = window.set_size(tauri::LogicalSize::new(new_width, new_height));

        // Re-anchor to bottom-right after resize
        let _ = window.move_window(tauri_plugin_positioner::Position::BottomRight);

        tracing::info!("Window resized to {new_width}×{new_height}");

        // Emit event to frontend for any UI adjustments
        let _ = app.emit(
            "pet:action",
            serde_json::json!({
                "action": "resizePet",
                "scale": scale
            }),
        );
    }
}
