use serde::{Deserialize, Serialize};

/// Audio format enum (matches frontend AudioFormat)
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum AudioFormat {
    #[serde(rename = "mp3")]
    Mp3,
    #[serde(rename = "wav")]
    Wav,
    #[serde(rename = "pcm_f32le")]
    PcmF32Le,
    #[serde(rename = "pcm_s16le")]
    PcmS16Le,
}

/// Three TTS request modes (matching Electron TTSSpeakOptions)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "model")]
pub enum TTSSpeakOptions {
    #[serde(rename = "preset")]
    Preset { text: String, voice: Option<String> },
    #[serde(rename = "clone")]
    Clone { text: String },
    #[serde(rename = "instruct")]
    Instruct { text: String, instruct: String },
}

impl TTSSpeakOptions {
    pub fn text(&self) -> &str {
        match self {
            Self::Preset { text, .. } => text,
            Self::Clone { text } => text,
            Self::Instruct { text, .. } => text,
        }
    }
}

/// Provider type selection
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum TTSProviderType {
    None,
    System,
    Local,
    Cloud,
}

/// System TTS provider configuration (macOS `say`, Windows PowerShell, Linux espeak-ng)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemTTSConfig {
    pub voice: Option<String>,
    pub rate: Option<f64>,
}

/// Local HTTP TTS provider configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocalTTSConfig {
    pub url: String,
    pub format: Option<String>,
}

/// Cloud TTS provider configuration (OpenAI, ElevenLabs, Azure, Custom)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CloudTTSConfig {
    pub provider: String,
    pub api_key: Option<String>,
    pub voice: Option<String>,
    pub model: Option<String>,
    pub endpoint: Option<String>,
}

/// Top-level TTS configuration, persisted via tauri-plugin-store
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TTSConfig {
    pub enabled: bool,
    pub max_chars: u32,
    pub source: TTSProviderType,
    pub interruption_strategy: String,
    pub chunk_size: u32,
    pub fallback_to_bubble: bool,
    pub system: Option<SystemTTSConfig>,
    pub local: Option<LocalTTSConfig>,
    pub cloud: Option<CloudTTSConfig>,
}

impl Default for TTSConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            max_chars: 500,
            source: TTSProviderType::None,
            interruption_strategy: "queue".into(),
            chunk_size: 16384,
            fallback_to_bubble: true,
            system: None,
            local: Some(LocalTTSConfig {
                url: "http://127.0.0.1:5000/tts".into(),
                format: None,
            }),
            cloud: Some(CloudTTSConfig {
                provider: "openai".into(),
                api_key: None,
                voice: Some("alloy".into()),
                model: Some("tts-1".into()),
                endpoint: None,
            }),
        }
    }
}

/// Playback state sent to frontend via app.emit()
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "status")]
pub enum TTSPlayState {
    Idle,
    Playing {
        request_id: Option<String>,
        text: String,
        total_chunks: u32,
        current_chunk: u32,
    },
    Completed {
        request_id: Option<String>,
    },
    Stopped,
    Error {
        request_id: Option<String>,
        message: String,
    },
}
