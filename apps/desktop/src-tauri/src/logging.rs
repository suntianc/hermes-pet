use tracing_subscriber::{fmt, prelude::*, EnvFilter};
use tracing_subscriber::layer::SubscriberExt;

/// Initialize tracing for structured logging.
///
/// Architecture (two-tier per STACK.md):
/// 1. tracing-subscriber (fmt + env-filter) → stdout/stderr for dev
/// 2. tauri-plugin-log → platform log dir file output + WebView console
///
/// File paths per D-14:
/// - macOS: ~/Library/Logs/com.vivipet.app/vivipet.log
/// - Linux: ~/.local/share/com.vivipet.app/logs/vivipet.log
/// - Windows: %APPDATA%/com.vivipet.app/logs/vivipet.log
///
/// Note: tauri-plugin-log's TargetKind::LogDir handles the
/// platform-specific path resolution automatically.
pub fn init() {
    // Tracing layer for stdout (dev mode, formatted output)
    let fmt_layer = fmt::layer()
        .with_target(true)
        .with_thread_ids(true)
        .with_file(true)
        .with_line_number(true);

    // Env filter: default "info", override via RUST_LOG env var
    let filter_layer = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| EnvFilter::new("info"));

    // Combine layers (tracing-subscriber registry)
    tracing_subscriber::registry()
        .with(filter_layer)
        .with(fmt_layer)
        .init();

    // Log init confirmation via tracing
    tracing::info!("Tracing initialized (stdout + file via tauri-plugin-log)");
    tracing::debug!("Debug logging enabled");
}
