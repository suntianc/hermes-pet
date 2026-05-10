pub mod config;
pub mod providers;
pub mod queue;
pub mod stream;

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use tauri::{AppHandle, Emitter};
use tauri::ipc::Channel;

use config::{TTSConfig, TTSProviderType, TTSSpeakOptions, TTSPlayState};
use queue::split_text;
use stream::TtsStreamEvent;
use providers::create_provider;

// Re-export key types at module level for convenience
pub use config::*;
pub use queue::*;

/// TTS Manager — orchestrates provider dispatch, abort handling, and state broadcasting.
///
/// Lifecycle (per TTS speak request):
/// 1. Frontend calls invoke("tts_speak", { text, voice, onEvent: Channel })
/// 2. Command handler → split_text() → create_provider() → spawn background task
/// 3. Task: for each text chunk → provider.synthesize() → Channel.send() for audio
/// 4. On completion/error: emit("tts:state", TTSPlayState) for status broadcast
/// 5. Abort via AtomicBool — set by tts_stop(), checked between chunks
pub struct TtsManager {
    abort: Arc<AtomicBool>,
}

impl TtsManager {
    pub fn new() -> Self {
        Self {
            abort: Arc::new(AtomicBool::new(false)),
        }
    }

    /// Create a TtsManager that shares an existing abort flag.
    /// Used to propagate abort signals from tts_stop to spawned background tasks.
    pub fn with_abort_flag(abort: Arc<AtomicBool>) -> Self {
        Self { abort }
    }

    /// Get a clone of the abort flag for passing to spawned tasks
    pub fn abort_flag(&self) -> Arc<AtomicBool> {
        self.abort.clone()
    }

    /// Signal abort — stops the currently running TTS at the next chunk boundary
    pub fn stop(&self) {
        self.abort.store(true, Ordering::SeqCst);
        tracing::info!("[TtsManager] Abort signal sent");
    }

    /// Reset abort flag for a new playback session
    pub fn reset_abort(&self) {
        self.abort.store(false, Ordering::SeqCst);
    }

    /// Process a single TTS request: split text → synthesize chunks → stream via Channel.
    ///
    /// Called from the background task spawned by the tts_speak command.
    /// Returns (total_chunks, duration_ms) or propagates error for higher-level handling.
    pub async fn process_request(
        &self,
        text: &str,
        options: Option<TTSSpeakOptions>,
        config: &TTSConfig,
        on_event: &Channel<TtsStreamEvent>,
        app_handle: &AppHandle,
    ) -> Result<(u32, u64), Box<dyn std::error::Error + Send + Sync>> {
        self.reset_abort();

        // Validate
        if text.trim().is_empty() {
            return Err("Empty text".into());
        }

        if config.source == TTSProviderType::None || !config.enabled {
            return Err("TTS is disabled".into());
        }

        // Split text into chunks (handles sentence→comma→hard split internally)
        let text_chunks = split_text(text, config.max_chars);
        if text_chunks.is_empty() {
            return Err("No text chunks after splitting".into());
        }

        // Create provider
        let provider =
            create_provider(&config.source)
                .ok_or_else(|| format!("No provider available for {:?}", config.source))?;

        tracing::info!(
            "[TtsManager] Starting TTS: provider={} chunks={}",
            provider.name(),
            text_chunks.len()
        );

        // Emit playing state
        let _ = app_handle.emit("tts:state", TTSPlayState::Playing {
            request_id: None,
            text: text.to_string(),
            total_chunks: text_chunks.len() as u32,
            current_chunk: 0,
        });

        let mut total_audio_chunks = 0u32;
        let start_time = std::time::Instant::now();

        for (chunk_idx, text_chunk) in text_chunks.iter().enumerate() {
            // Check abort signal
            if self.abort.load(Ordering::SeqCst) {
                tracing::info!(
                    "[TtsManager] Aborted at chunk {}/{}",
                    chunk_idx,
                    text_chunks.len()
                );
                return Err("Aborted by user".into());
            }

            // Synthesize this text chunk
            let audio_chunks = provider
                .synthesize(text_chunk, options.as_ref(), config)
                .await
                .map_err(|e| {
                    format!(
                        "Provider '{}' failed at chunk {}: {}",
                        provider.name(),
                        chunk_idx,
                        e
                    )
                })?;

            // Send each audio chunk through the Channel
            for audio_chunk in &audio_chunks {
                let _ = on_event.send(TtsStreamEvent::audio_chunk(
                    audio_chunk.data.clone(),
                    total_audio_chunks,
                    audio_chunk.sample_rate,
                    chunk_idx == text_chunks.len() - 1 && audio_chunk.is_final,
                ));
                total_audio_chunks += 1;
            }
        }

        let elapsed = start_time.elapsed();
        tracing::info!(
            "[TtsManager] Completed: {} audio chunks in {:?}",
            total_audio_chunks,
            elapsed
        );

        Ok((total_audio_chunks, elapsed.as_millis() as u64))
    }
}
