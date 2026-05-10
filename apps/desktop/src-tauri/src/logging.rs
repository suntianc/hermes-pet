/// Initialize tracing for structured logging.
///
/// Uses tauri-plugin-log as the sole logging backend.
/// It writes to both platform log dir and stdout.
///
/// File paths:
/// - macOS: ~/Library/Logs/com.vivipet.app/vivipet.log
/// - Linux: ~/.local/share/com.vivipet.app/logs/vivipet.log
/// - Windows: %APPDATA%/com.vivipet.app/logs/vivipet.log
pub fn init() {
    tracing::info!("ViviPet Tauri app starting");
    tracing::debug!("Debug logging enabled");
}
