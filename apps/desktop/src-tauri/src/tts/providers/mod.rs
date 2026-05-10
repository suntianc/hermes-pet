use async_trait::async_trait;

use crate::tts::config::{AudioFormat, TTSConfig, TTSSpeakOptions};
use crate::tts::queue::TextChunk;

/// An audio chunk yielded by a TTS provider's synthesis stream
#[derive(Debug, Clone)]
pub struct AudioChunk {
    pub data: Vec<u8>,
    pub format: AudioFormat,
    pub sample_rate: u32,
    pub seq: u32,
    pub is_final: bool,
}

/// Result of a TTS synthesis — a Vec of AudioChunks containing the full synthesized audio
pub type TtsStreamResult = Result<Vec<AudioChunk>, Box<dyn std::error::Error + Send + Sync>>;

/// Provider trait — each provider implements synthesize as an async call
/// that returns all audio chunks. Streaming is handled by TtsManager splitting
/// the result into Channel sends.
#[async_trait]
pub trait TtsProvider: Send + Sync {
    /// Synthesize the full text into a Vec of audio chunks.
    /// The provider is responsible for:
    ///   - Calling the TTS backend (system command / HTTP request)
    ///   - Collecting all audio bytes
    ///   - Splitting into chunks with sequential seq numbers
    async fn synthesize(
        &self,
        chunk: &TextChunk,
        options: Option<&TTSSpeakOptions>,
        config: &TTSConfig,
    ) -> Result<Vec<AudioChunk>, Box<dyn std::error::Error + Send + Sync>>;

    /// Human-readable provider name for logging
    fn name(&self) -> &'static str;

    /// Whether this provider is available on the current platform
    fn is_available(&self) -> bool {
        true
    }
}

// Submodules — activated in Plan 02
// pub mod system;   // Plan 02
// pub mod local;    // Plan 02
// pub mod cloud;    // Plan 02
