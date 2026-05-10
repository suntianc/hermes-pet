use serde::Serialize;
use tauri::{AppHandle, Manager};

#[derive(Serialize)]
pub struct Position2D {
    pub x: i32,
    pub y: i32,
}

/// Toggle mouse passthrough (ignore mouse events).
/// Equivalent to electron/ipc.ts: pet:window:setIgnoreMouseEvents
#[tauri::command]
pub fn set_ignore_mouse_events(app: AppHandle, ignore: bool) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_ignore_cursor_events(ignore);
        tracing::info!("Mouse passthrough: {ignore}");
    }
}

/// Begin drag session — record current window position and pointer.
/// Equivalent to electron/ipc.ts: pet:window:beginDrag
#[tauri::command]
pub fn begin_drag(app: AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.start_dragging();
    }
}

/// Get current window position.
/// Equivalent to electron/ipc.ts: pet:window:getPosition
#[tauri::command]
pub fn get_window_position(app: AppHandle) -> Result<Position2D, String> {
    if let Some(window) = app.get_webview_window("main") {
        let position = window
            .outer_position()
            .map_err(|e| format!("Failed to get window position: {e}"))?;
        Ok(Position2D {
            x: position.x,
            y: position.y,
        })
    } else {
        Ok(Position2D { x: 0, y: 0 })
    }
}

/// Set window size, keeping it within the current display's work area.
/// Equivalent to electron/ipc.ts: pet:window:setSize
#[tauri::command]
pub fn set_window_size(app: AppHandle, width: f64, height: f64) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_size(tauri::LogicalSize::new(width.max(1.0), height.max(1.0)));
    }
}

/// Set window size anchored to bottom-right.
/// Equivalent to electron/ipc.ts: pet:window:setSizeAnchored
#[tauri::command]
pub fn set_size_anchored(app: AppHandle, width: f64, height: f64) {
    if let Some(window) = app.get_webview_window("main") {
        // Get current position (bottom-right reference point is the window's right-bottom corner)
        if let Ok(pos) = window.outer_position() {
            if let Ok(size) = window.outer_size() {
                let right = pos.x + size.width as i32;
                let bottom = pos.y + size.height as i32;
                let new_x = (right as f64 - width).max(0.0);
                let new_y = (bottom as f64 - height).max(0.0);
                let _ = window.set_position(tauri::LogicalPosition::new(new_x, new_y));
                let _ = window.set_size(tauri::LogicalSize::new(width.max(1.0), height.max(1.0)));
            }
        }
    }
}

/// Update tray model names list and current model index.
/// For Phase 1, this is a no-op placeholder. Phase 4 (Model Management) will wire the full implementation.
#[tauri::command]
pub fn update_model_names(_app: AppHandle, names: Vec<String>) {
    // Placeholder — will be implemented in Phase 4 (Model Management)
    tracing::info!("Model names updated: {names:?}");
}
