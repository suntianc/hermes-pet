use async_trait::async_trait;
use reqwest::Client;

use crate::tts::config::{AudioFormat, TTSConfig, TTSSpeakOptions};
use crate::tts::queue::TextChunk;
use super::{AudioChunk, TtsProvider};

pub struct CloudProvider;

#[async_trait]
impl TtsProvider for CloudProvider {
    async fn synthesize(
        &self,
        chunk: &TextChunk,
        options: Option<&TTSSpeakOptions>,
        config: &TTSConfig,
    ) -> Result<Vec<AudioChunk>, Box<dyn std::error::Error + Send + Sync>> {
        let cloud_cfg = config
            .cloud
            .as_ref()
            .ok_or("Cloud TTS not configured")?;

        let _api_key = cloud_cfg
            .api_key
            .as_ref()
            .ok_or("Cloud TTS: API key not configured")?;

        let voice = resolve_cloud_voice(options, cloud_cfg);
        let chunk_size = config.chunk_size as usize;

        let (url, headers, body, format, sample_rate) =
            build_cloud_request(cloud_cfg, &chunk.text, &voice, options)?;

        let client = Client::new();
        let mut req = client.post(&url);
        for (key, value) in &headers {
            req = req.header(key.as_str(), value.as_str());
        }
        req = req.json(&body);

        tracing::info!("[CloudTTS] {} voice={}", cloud_cfg.provider, voice);

        let response = req
            .send()
            .await
            .map_err(|e| format!("Cloud TTS request failed: {e}"))?;

        if !response.status().is_success() {
            let status = response.status();
            let err_body = response.text().await.unwrap_or_default();
            return Err(format!("Cloud TTS HTTP {}: {}", status, err_body).into());
        }

        let bytes = response
            .bytes()
            .await
            .map_err(|e| format!("Failed to read cloud TTS response: {e}"))?;

        Ok(split_into_chunks(&bytes, format, sample_rate, chunk_size))
    }

    fn name(&self) -> &'static str {
        "cloud"
    }
}

fn resolve_cloud_voice(options: Option<&TTSSpeakOptions>, config: &crate::tts::config::CloudTTSConfig) -> String {
    if let Some(TTSSpeakOptions::Preset { voice: Some(v), .. }) = options {
        return v.clone();
    }
    config.voice.clone().unwrap_or_else(|| "alloy".into())
}

fn build_cloud_request(
    config: &crate::tts::config::CloudTTSConfig,
    text: &str,
    voice: &str,
    options: Option<&TTSSpeakOptions>,
) -> Result<
    (String, Vec<(String, String)>, serde_json::Value, AudioFormat, u32),
    Box<dyn std::error::Error + Send + Sync>,
> {
    match config.provider.as_str() {
        "openai" => {
            let api_key = config.api_key.as_deref().unwrap_or("");
            let model = config.model.as_deref().unwrap_or("tts-1");
            let body = serde_json::json!({
                "model": model,
                "input": text,
                "voice": voice,
                "response_format": "wav",
            });
            Ok((
                "https://api.openai.com/v1/audio/speech".into(),
                vec![
                    ("Authorization".into(), format!("Bearer {}", api_key)),
                    ("Content-Type".into(), "application/json".into()),
                ],
                body,
                AudioFormat::Wav,
                24000,
            ))
        }
        "elevenlabs" => {
            let api_key = config.api_key.as_deref().unwrap_or("");
            let model = config.model.as_deref().unwrap_or("eleven_turbo_v2");
            let body = serde_json::json!({
                "text": text,
                "model_id": model,
                "voice_settings": {
                    "stability": 0.5,
                    "similarity_boost": 0.75,
                },
            });
            Ok((
                format!(
                    "https://api.elevenlabs.io/v1/text-to-speech/{}/stream",
                    voice
                ),
                vec![
                    ("xi-api-key".into(), api_key.into()),
                    ("Content-Type".into(), "application/json".into()),
                ],
                body,
                AudioFormat::Mp3,
                44100,
            ))
        }
        "azure" => {
            let api_key = config.api_key.as_deref().unwrap_or("");
            let endpoint = config.endpoint.as_deref().unwrap_or(
                "https://your-region.tts.speech.microsoft.com/cognitiveservices/v1",
            );
            let ssml = format!(
                "<speak version='1.0' xml:lang='en-US'>\
                 <voice xml:lang='en-US' xml:gender='Female' name='{}'>\
                 {}\
                 </voice></speak>",
                voice,
                escape_xml(text)
            );
            Ok((
                endpoint.into(),
                vec![
                    ("Ocp-Apim-Subscription-Key".into(), api_key.into()),
                    ("Content-Type".into(), "application/ssml+xml".into()),
                    (
                        "X-Microsoft-OutputFormat".into(),
                        "audio-48khz-192kbitrate-mono-mp3".into(),
                    ),
                ],
                serde_json::Value::String(ssml),
                AudioFormat::Mp3,
                48000,
            ))
        }
        "custom" => {
            let endpoint = config.endpoint.as_deref().unwrap_or("http://127.0.0.1:5000/tts");
            let custom_body = match options {
                Some(TTSSpeakOptions::Preset { voice: v, .. }) => serde_json::json!({
                    "text": text,
                    "voice": v,
                    "model": "preset",
                }),
                Some(TTSSpeakOptions::Instruct { instruct, .. }) => serde_json::json!({
                    "text": text,
                    "instruct": instruct,
                    "model": "instruct",
                }),
                _ => serde_json::json!({
                    "text": text,
                    "voice": voice,
                    "model": "preset",
                }),
            };
            Ok((
                endpoint.into(),
                vec![("Content-Type".into(), "application/json".into())],
                custom_body,
                AudioFormat::Mp3,
                24000,
            ))
        }
        other => Err(format!("Unknown cloud TTS provider: {other}").into()),
    }
}

fn split_into_chunks(
    data: &[u8],
    format: AudioFormat,
    sample_rate: u32,
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
            sample_rate,
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
            sample_rate,
            seq: 0,
            is_final: true,
        });
    }
    chunks
}

fn escape_xml(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}
