use async_trait::async_trait;
use reqwest::Client;

use crate::tts::config::{AudioFormat, TTSConfig, TTSSpeakOptions};
use crate::tts::queue::TextChunk;
use super::{AudioChunk, TtsProvider};

pub struct LocalProvider;

#[async_trait]
impl TtsProvider for LocalProvider {
    async fn synthesize(
        &self,
        chunk: &TextChunk,
        options: Option<&TTSSpeakOptions>,
        config: &TTSConfig,
    ) -> Result<Vec<AudioChunk>, Box<dyn std::error::Error + Send + Sync>> {
        let local_cfg = config
            .local
            .as_ref()
            .ok_or("Local TTS not configured")?
            .clone();
        let url = local_cfg.url.clone();
        let chunk_size = config.chunk_size as usize;
        let client = Client::new();

        // Build request body with capital-case fields (matching Electron local-streamer.ts)
        let body = build_local_body(chunk, options);

        tracing::info!(
            "[LocalTTS] POST {} model={:?}",
            url,
            options.map(|o| match o {
                TTSSpeakOptions::Preset { .. } => "preset",
                TTSSpeakOptions::Clone { .. } => "clone",
                TTSSpeakOptions::Instruct { .. } => "instruct",
            })
        );

        let response = client
            .post(&url)
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Local TTS request failed: {e}"))?;

        if !response.status().is_success() {
            let status = response.status();
            let err_body = response.text().await.unwrap_or_default();
            return Err(format!("Local TTS HTTP {}: {}", status, err_body).into());
        }

        // Detect format from content-type
        let format = detect_format(
            response
                .headers()
                .get("content-type")
                .and_then(|v| v.to_str().ok())
                .unwrap_or(""),
        );

        // Read all bytes from the response body
        let bytes = response
            .bytes()
            .await
            .map_err(|e| format!("Failed to read local TTS response: {e}"))?;

        Ok(split_into_chunks(&bytes, format, chunk_size))
    }

    fn name(&self) -> &'static str {
        "local"
    }
}

fn build_local_body(chunk: &TextChunk, options: Option<&TTSSpeakOptions>) -> serde_json::Value {
    // Match Electron local-streamer.ts: uppercase first letter field names
    match options {
        Some(TTSSpeakOptions::Preset { voice, .. }) => serde_json::json!({
            "Text": chunk.text,
            "Model": "preset",
            "Voice": voice,
        }),
        Some(TTSSpeakOptions::Clone { .. }) => serde_json::json!({
            "Text": chunk.text,
            "Model": "clone",
        }),
        Some(TTSSpeakOptions::Instruct { instruct, .. }) => serde_json::json!({
            "Text": chunk.text,
            "Instruct": instruct,
            "Model": "instruct",
        }),
        None => serde_json::json!({
            "Text": chunk.text,
            "Model": "preset",
        }),
    }
}

fn detect_format(content_type: &str) -> AudioFormat {
    if content_type.contains("wav") || content_type.contains("wave") {
        AudioFormat::Wav
    } else if content_type.contains("pcm") || content_type.contains("l16") {
        AudioFormat::PcmS16Le
    } else if content_type.contains("mp3") || content_type.contains("mpeg") {
        AudioFormat::Mp3
    } else {
        AudioFormat::Mp3 // Default
    }
}

fn split_into_chunks(
    data: &[u8],
    format: AudioFormat,
    chunk_size: usize,
) -> Vec<AudioChunk> {
    let total = data.len();
    let mut chunks = Vec::new();
    let mut seq = 0u32;
    let mut offset = 0;

    while offset < total {
        let end = std::cmp::min(offset + chunk_size, total);
        chunks.push(AudioChunk {
            data: data[offset..end].to_vec(),
            format: format.clone(),
            sample_rate: 24000, // Default sample rate; frontend re-decodes anyway
            seq,
            is_final: end >= total,
        });
        seq += 1;
        offset = end;
    }

    if chunks.is_empty() {
        chunks.push(AudioChunk {
            data: Vec::new(),
            format,
            sample_rate: 24000,
            seq: 0,
            is_final: true,
        });
    }

    chunks
}
