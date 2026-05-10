use serde::Serialize;

/// Events sent through the Tauri Channel from Rust TTS engine to the WebView audio player.
/// The Channel is typed as `Channel<TtsStreamEvent>`.
///
/// Design:
/// - Audio chunks: sent via Channel (ordered, binary-capable)
/// - State transitions: sent via `app.emit("tts:state", TTSPlayState)` (global broadcast)
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "event")]
pub enum TtsStreamEvent {
    /// A chunk of audio data to be played by StreamingAudioPlayer
    #[serde(rename = "audio")]
    AudioChunk {
        /// Raw audio bytes (PCM 16-bit for system provider, provider-native for cloud/local)
        data: Vec<u8>,
        /// Monotonic sequence number for ordering
        seq: u32,
        /// Sample rate in Hz (e.g., 44100, 24000)
        sample_rate: u32,
        /// True if this is the last chunk for the current segment
        #[serde(rename = "isFinal")]
        is_final: bool,
    },
    /// All chunks for the current TTS request have been sent
    #[serde(rename = "finished")]
    Finished {
        #[serde(rename = "totalChunks")]
        total_chunks: u32,
        #[serde(rename = "durationMs")]
        duration_ms: u64,
    },
    /// An error occurred during TTS synthesis
    #[serde(rename = "error")]
    Error {
        message: String,
        /// True if the error is recoverable (e.g., provider unavailable, fallback possible)
        recoverable: bool,
    },
}

impl TtsStreamEvent {
    /// Create an AudioChunk event with data and metadata
    pub fn audio_chunk(data: Vec<u8>, seq: u32, sample_rate: u32, is_final: bool) -> Self {
        Self::AudioChunk {
            data,
            seq,
            sample_rate,
            is_final,
        }
    }

    /// Create a Finished event after all chunks are sent
    pub fn finished(total_chunks: u32, duration_ms: u64) -> Self {
        Self::Finished {
            total_chunks,
            duration_ms,
        }
    }

    /// Create an Error event
    pub fn error(message: impl Into<String>, recoverable: bool) -> Self {
        Self::Error {
            message: message.into(),
            recoverable,
        }
    }
}

/// Helper to split raw audio bytes into chunks with sequence numbers
pub fn split_audio_chunks(
    data: &[u8],
    chunk_size: usize,
    sample_rate: u32,
) -> Vec<TtsStreamEvent> {
    let mut chunks = Vec::new();
    let total = data.len();
    let mut seq = 0u32;
    let mut offset = 0;

    while offset < total {
        let end = std::cmp::min(offset + chunk_size, total);
        let is_final = end >= total;
        chunks.push(TtsStreamEvent::audio_chunk(
            data[offset..end].to_vec(),
            seq,
            sample_rate,
            is_final,
        ));
        seq += 1;
        offset = end;
    }

    if chunks.is_empty() {
        // Send a single empty chunk as final for zero-length audio
        chunks.push(TtsStreamEvent::audio_chunk(
            Vec::new(),
            0,
            sample_rate,
            true,
        ));
    }

    chunks
}
