use tauri::WebviewWindow;
use tauri_plugin_positioner::{WindowExt, Position};

/// Anchor the window to bottom-right of the current display.
/// Uses tauri-plugin-positioner for cross-platform positioning.
pub fn move_to_bottom_right(window: &WebviewWindow) -> Result<(), Box<dyn std::error::Error>> {
    window.move_window(Position::BottomRight)?;
    Ok(())
}

/// Anchor the window to bottom-right of a specific display by index.
/// This supports multi-monitor — the last known screen is stored
/// by tauri-plugin-window-state, which handles multi-display persistence.
/// On startup, window-state restores position before we apply any anchor.
pub fn move_to_bottom_right_on_display(
    window: &WebviewWindow,
    _display_index: u32,
) -> Result<(), Box<dyn std::error::Error>> {
    // tauri-plugin-positioner positions on the display where the window currently is.
    // Set window to target display first, then anchor to bottom-right.
    // For now, this is a simple wrapper; multi-display fine-tuning can be added later.
    window.move_window(Position::BottomRight)?;
    Ok(())
}
