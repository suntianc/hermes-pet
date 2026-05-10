//! HTTP Adapter — Embedded axum server for external Agent event integration.
//!
//! This module provides an HTTP server on port 18765 that accepts agent lifecycle
//! events (POST /adapter), normalizes them, and emits them to the Tauri WebView
//! as `pet:event` events for pet animation and speech feedback.
//!
//! ## Lifecycle
//!
//! 1. **Start**: Called from `lib.rs setup()` — binds to 127.0.0.1:{port} and
//!    spawns axum on Tauri's shared Tokio runtime.
//! 2. **Run**: Accepts POST /adapter and GET /adapter/capabilities requests.
//! 3. **Shutdown**: On `RunEvent::Exit`, the CancellationToken is cancelled,
//!    triggering graceful shutdown via `with_graceful_shutdown`.

pub mod events;
pub mod lifecycle;
pub mod routes;

use std::net::SocketAddr;
use std::str::FromStr;
use std::sync::Arc;

use tauri::AppHandle;
use tokio::net::TcpListener;
use tokio::sync::Notify;

/// Default port for the adapter HTTP server.
pub const DEFAULT_ADAPTER_PORT: u16 = 18765;

/// Environment variable to override the adapter port.
const ENV_ADAPTER_PORT: &str = "VIVIPET_ADAPTER_PORT";

/// Start the adapter HTTP server on a background task.
///
/// Binds to `127.0.0.1:{port}` where port is:
/// 1. `VIVIPET_ADAPTER_PORT` env var, if set and valid
/// 2. `DEFAULT_ADAPTER_PORT` (18765)
///
/// The server runs on Tauri's shared Tokio runtime and uses the provided
/// Notify signal for graceful shutdown.
///
/// Returns the actual port the server bound to (useful if env var changed the value).
pub async fn start_server(app_handle: AppHandle, shutdown_signal: Arc<Notify>) -> u16 {
    let port = resolve_port();
    let addr = SocketAddr::from(([127, 0, 0, 1], port));

    let listener = match TcpListener::bind(addr).await {
        Ok(l) => {
            let actual = l.local_addr().unwrap_or(addr);
            tracing::info!(
                "[Adapter] HTTP server bound to 127.0.0.1:{}",
                actual.port()
            );
            l
        }
        Err(e) => {
            tracing::error!(
                "[Adapter] Failed to bind to 127.0.0.1:{}: {e}",
                port
            );
            return 0;
        }
    };

    let actual_port = listener.local_addr().map(|a| a.port()).unwrap_or(port);

    // Build the axum router with shared AppHandle state
    let router = routes::build_router(app_handle);

    // Spawn the server on the shared Tokio runtime
    // (this is Tauri's runtime via tauri::async_runtime::spawn)
    tokio::spawn(async move {
        tracing::info!("[Adapter] Starting axum server on 127.0.0.1:{}", actual_port);

        axum::serve(listener, router)
            .with_graceful_shutdown(async move {
                shutdown_signal.notified().await;
                tracing::info!("[Adapter] Axum server shutdown complete");
            })
            .await
            .unwrap_or_else(|e| {
                tracing::error!("[Adapter] Axum server error: {e}");
            });
    });

    actual_port
}

/// Resolve the adapter port from env var or use default.
fn resolve_port() -> u16 {
    std::env::var(ENV_ADAPTER_PORT)
        .ok()
        .and_then(|v| u16::from_str(&v).ok())
        .unwrap_or(DEFAULT_ADAPTER_PORT)
}
