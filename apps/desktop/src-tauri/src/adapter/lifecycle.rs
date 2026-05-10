//! Adapter server lifecycle management via [`tokio::sync::Notify`].
//!
//! The `AdapterLifecycle` struct is created during `setup()` in lib.rs and stored
//! in AppState. When the application exits (RunEvent::Exit), `shutdown()` notifies
//! all waiters, triggering graceful shutdown of the axum server via
//! `with_graceful_shutdown`.

use std::sync::Arc;
use tokio::sync::Notify;

/// Manages the adapter server lifecycle.
///
/// - Created in `setup()` with a shared `Arc<Notify>`
/// - A clone of the Arc is passed to `axum::serve().with_graceful_shutdown()`
/// - On app exit, `shutdown()` calls `notify_waiters()`, waking the graceful shutdown future
///
/// Because `Arc<Notify>` is `Clone + Send + Sync`, the values can safely
/// cross task boundaries between setup(), the spawned axum task, and the exit handler.
pub struct AdapterLifecycle {
    /// Shared notify primitive — `.notify_waiters()` triggers graceful shutdown.
    notify: Arc<Notify>,
}

impl AdapterLifecycle {
    /// Create a new lifecycle with a fresh Notify.
    pub fn new() -> Self {
        Self {
            notify: Arc::new(Notify::new()),
        }
    }

    /// Get a clone of the Notify Arc to pass to `axum::serve().with_graceful_shutdown()`.
    ///
    /// The graceful shutdown future awaits `notify.notified()`. When `shutdown()` is called,
    /// `notify_waiters()` wakes the future, causing the server to stop accepting new
    /// connections and allowing in-flight requests to complete.
    pub fn shutdown_signal(&self) -> Arc<Notify> {
        self.notify.clone()
    }

    /// Signal shutdown — triggers graceful shutdown of the axum server.
    ///
    /// Any in-flight requests will complete before the server stops,
    /// because `with_graceful_shutdown` waits for the notification signal
    /// and then stops accepting new connections.
    pub fn shutdown(&self) {
        self.notify.notify_waiters();
    }
}

impl Default for AdapterLifecycle {
    fn default() -> Self {
        Self::new()
    }
}
