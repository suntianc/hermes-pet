use tracing_subscriber::EnvFilter;

/// Initialize the tracing subscriber for structured logging.
///
/// Reads `RUST_LOG` env var for the filter level, defaults to `info`.
/// Plan 03 will add file output with rotation.
pub fn init() {
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| EnvFilter::new("info")),
        )
        .with_target(true)
        .with_thread_ids(true)
        .init();

    tracing::info!("Tracing initialized");
}
