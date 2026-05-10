use async_trait::async_trait;
use std::process::Command;

use crate::tts::config::{AudioFormat, TTSConfig, TTSSpeakOptions};
use crate::tts::queue::TextChunk;
use super::{AudioChunk, TtsProvider};

#[cfg(target_os = "linux")]
use std::io::Cursor;

const SAMPLE_RATE: u32 = 44100;

pub struct SystemProvider;

#[async_trait]
impl TtsProvider for SystemProvider {
    async fn synthesize(
        &self,
        chunk: &TextChunk,
        options: Option<&TTSSpeakOptions>,
        config: &TTSConfig,
    ) -> Result<Vec<AudioChunk>, Box<dyn std::error::Error + Send + Sync>> {
        let pcm_data = platform_synthesize(chunk, options, config).await?;
        let chunk_size = config.chunk_size as usize;
        Ok(split_audio_pcm(&pcm_data, chunk_size))
    }

    fn name(&self) -> &'static str {
        "system"
    }

    fn is_available(&self) -> bool {
        #[cfg(target_os = "macos")]
        {
            Command::new("which")
                .arg("say")
                .output()
                .map(|o| o.status.success())
                .unwrap_or(false)
        }
        #[cfg(target_os = "windows")]
        {
            true // PowerShell is always available on Windows
        }
        #[cfg(target_os = "linux")]
        {
            Command::new("which")
                .arg("espeak-ng")
                .output()
                .map(|o| o.status.success())
                .unwrap_or(false)
        }
    }
}

/// Platform-specific synthesis: runs the system command and returns raw PCM 16-bit data
async fn platform_synthesize(
    chunk: &TextChunk,
    options: Option<&TTSSpeakOptions>,
    config: &TTSConfig,
) -> Result<Vec<u8>, Box<dyn std::error::Error + Send + Sync>> {
    let voice = resolve_voice(options, config);

    #[cfg(target_os = "macos")]
    {
        macos_synthesize(&chunk.text, &voice).await
    }

    #[cfg(target_os = "windows")]
    {
        windows_synthesize(&chunk.text).await
    }

    #[cfg(target_os = "linux")]
    {
        linux_synthesize(&chunk.text).await
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    {
        Err("Unsupported platform for system TTS".into())
    }
}

fn resolve_voice(options: Option<&TTSSpeakOptions>, config: &TTSConfig) -> String {
    // Priority: options.voice → config.system.voice → platform default
    if let Some(opts) = options {
        if let TTSSpeakOptions::Preset { voice: Some(v), .. } = opts {
            return v.clone();
        }
    }
    config
        .system
        .as_ref()
        .and_then(|s| s.voice.clone())
        .unwrap_or_else(|| "Samantha".into()) // macOS default
}

/// On macOS use `say -o temp.wav "text"` then parse WAV with hound
#[cfg(target_os = "macos")]
async fn macos_synthesize(
    text: &str,
    voice: &str,
) -> Result<Vec<u8>, Box<dyn std::error::Error + Send + Sync>> {
    let tmp_path =
        std::env::temp_dir().join(format!("vivipet_tts_{}.wav", std::process::id()));

    tokio::task::spawn_blocking({
        let tmp = tmp_path.clone();
        let text = text.to_string();
        let voice = voice.to_string();
        move || {
            match Command::new("say")
                .args(["-o", tmp.to_str().unwrap_or("/tmp/vivipet_tts.wav")])
                .arg("-v")
                .arg(&voice)
                .arg(&text)
                .output()
            {
                Ok(o) if o.status.success() => Ok(()),
                Ok(o) => Err(format!(
                    "say exited with code {:?}: {}",
                    o.status.code(),
                    String::from_utf8_lossy(&o.stderr)
                )),
                Err(e) => Err(format!("Failed to run say: {e}")),
            }
        }
    })
    .await
    .map_err(|e| format!("spawn_blocking: {e}"))??;

    // Read the WAV file using hound
    let pcm_data = tokio::task::spawn_blocking(move || {
        let mut reader = hound::WavReader::open(&tmp_path)
            .map_err(|e| format!("Failed to read WAV: {e}"))?;
        let spec = reader.spec();
        tracing::info!(
            "System TTS WAV: {} channels, {} Hz, {:?}",
            spec.channels,
            spec.sample_rate,
            spec.sample_format
        );

        // Read 16-bit samples and convert to raw PCM bytes
        let samples: Vec<i16> = reader
            .samples::<i16>()
            .filter_map(|s| s.ok())
            .collect();

        // Convert to bytes (little-endian)
        let bytes: Vec<u8> = samples
            .iter()
            .flat_map(|s| s.to_le_bytes())
            .collect();

        // Clean up temp file
        let _ = std::fs::remove_file(&tmp_path);

        Ok::<Vec<u8>, String>(bytes)
    })
    .await
    .map_err(|e| format!("spawn_blocking: {e}"))??;

    Ok(pcm_data)
}

/// On Windows use PowerShell System.Speech to generate WAV
#[cfg(target_os = "windows")]
async fn windows_synthesize(
    text: &str,
) -> Result<Vec<u8>, Box<dyn std::error::Error + Send + Sync>> {
    let tmp_path =
        std::env::temp_dir().join(format!("vivipet_tts_{}.wav", std::process::id()));
    let tmp_str = tmp_path.to_str().unwrap_or("C:\\temp\\vivipet_tts.wav");

    let ps_script = format!(
        "Add-Type -AssemblyName System.Speech; \
         $speak = New-Object System.Speech.Synthesis.SpeechSynthesizer; \
         $speak.SetOutputToWaveFile('{}'); \
         $speak.Speak('{}'); \
         $speak.Dispose()",
        tmp_str.replace('\'', "''"),
        text.replace('\'', "''")
    );

    let output = tokio::task::spawn_blocking(move || {
        Command::new("powershell")
            .args(["-NoProfile", "-Command", &ps_script])
            .output()
    })
    .await
    .map_err(|e| format!("spawn_blocking: {e}"))?
    .map_err(|e| format!("Failed to run PowerShell: {e}"))?;

    if !output.status.success() {
        return Err(format!(
            "PowerShell exited with code {:?}",
            output.status.code()
        )
        .into());
    }

    let pcm_data = tokio::task::spawn_blocking(move || {
        let mut reader = hound::WavReader::open(&tmp_path)
            .map_err(|e| format!("Failed to read WAV: {e}"))?;
        let samples: Vec<i16> = reader
            .samples::<i16>()
            .filter_map(|s| s.ok())
            .collect();
        let bytes: Vec<u8> = samples.iter().flat_map(|s| s.to_le_bytes()).collect();
        let _ = std::fs::remove_file(&tmp_path);
        Ok::<Vec<u8>, String>(bytes)
    })
    .await
    .map_err(|e| format!("spawn_blocking: {e}"))??;

    Ok(pcm_data)
}

/// On Linux use `espeak-ng --stdout` which outputs WAV to stdout
#[cfg(target_os = "linux")]
async fn linux_synthesize(
    text: &str,
) -> Result<Vec<u8>, Box<dyn std::error::Error + Send + Sync>> {
    let output = tokio::task::spawn_blocking({
        let text = text.to_string();
        move || {
            Command::new("espeak-ng")
                .args(["--stdout", &text])
                .output()
        }
    })
    .await
    .map_err(|e| format!("spawn_blocking: {e}"))?
    .map_err(|e| format!("Failed to run espeak-ng: {e}"))?;

    if !output.status.success() {
        return Err(format!(
            "espeak-ng exited with code {:?}",
            output.status.code()
        )
        .into());
    }

    // espeak-ng --stdout outputs WAV to stdout
    let wav_bytes = output.stdout;

    // Parse WAV header with hound from memory
    let pcm_data = tokio::task::spawn_blocking(move || {
        let cursor = Cursor::new(wav_bytes);
        let mut reader = hound::WavReader::new(cursor)
            .map_err(|e| format!("Failed to parse espeak WAV: {e}"))?;
        let samples: Vec<i16> = reader
            .samples::<i16>()
            .filter_map(|s| s.ok())
            .collect();

        let bytes: Vec<u8> = samples.iter().flat_map(|s| s.to_le_bytes()).collect();

        Ok::<Vec<u8>, String>(bytes)
    })
    .await
    .map_err(|e| format!("spawn_blocking: {e}"))??;

    Ok(pcm_data)
}

/// Split raw PCM 16-bit bytes into AudioChunks matching the provider trait contract
fn split_audio_pcm(pcm_data: &[u8], chunk_size: usize) -> Vec<AudioChunk> {
    let mut chunks = Vec::new();
    let total = pcm_data.len();
    let mut seq = 0u32;
    let mut offset = 0;

    while offset < total {
        let end = std::cmp::min(offset + chunk_size, total);
        chunks.push(AudioChunk {
            data: pcm_data[offset..end].to_vec(),
            format: AudioFormat::PcmS16Le,
            sample_rate: SAMPLE_RATE,
            seq,
            is_final: end >= total,
        });
        seq += 1;
        offset = end;
    }

    if chunks.is_empty() {
        chunks.push(AudioChunk {
            data: Vec::new(),
            format: AudioFormat::PcmS16Le,
            sample_rate: SAMPLE_RATE,
            seq: 0,
            is_final: true,
        });
    }

    chunks
}
