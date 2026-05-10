mod position;

use tauri::Manager;
use tauri_plugin_positioner::WindowExt;

pub use position::*;

/// Apply window setup during Tauri app initialization.
/// Called from lib.rs setup closure.
pub fn setup_window(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let window = app
        .get_webview_window("main")
        .ok_or("Main webview window not found")?;

    // Positioner: anchor to bottom-right
    // Note: tauri-plugin-window-state will save/restore the position,
    // so on second launch the window_state restore fires first,
    // then positioning re-anchors. This is correct — positioner ensures
    // the window is at bottom-right on first launch.
    window.move_window(tauri_plugin_positioner::Position::BottomRight)?;

    tracing::info!("Window positioned at bottom-right");

    Ok(())
}
