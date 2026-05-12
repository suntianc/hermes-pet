use std::sync::Mutex;

use tauri::{AppHandle, Emitter, Manager};
use tauri::ipc::Channel;
use tauri_plugin_store::StoreExt;

use crate::error::AppError;
use crate::state::AppState;
use crate::tts::config::{TTSConfig, TTSSpeakOptions, TTSProviderType, TTSPlayState};
use crate::tts::stream::TtsStreamEvent;

/// Speak text through the configured TTS provider.
/// Frontend creates a Channel<TtsStreamEvent> and passes it as onEvent.
/// The command returns immediately — audio streaming happens in a background task.
#[tauri::command]
pub async fn tts_speak(
    app: AppHandle,
    text: String,
    voice: Option<String>,
    on_event: Channel<TtsStreamEvent>,
) -> Result<(), AppError> {
    // Quick validation before spawning
    if text.trim().is_empty() {
        let _ = on_event.send(TtsStreamEvent::error("Empty text", false));
        return Err(AppError::Tts("Empty text provided".into()));
    }

    let state = app.state::<Mutex<AppState>>();
    let (config, abort_flag) = {
        let guard = state.lock().map_err(|e| AppError::Tts(format!("Lock error: {e}")))?;
        (guard.tts_config.clone(), guard.tts_manager.abort_flag())
    };

    if config.source == TTSProviderType::None || !config.enabled {
        let _ = on_event.send(TtsStreamEvent::error("TTS is disabled or no source configured", false));
        return Err(AppError::Tts("TTS is disabled".into()));
    }

    let trimmed = text.trim().to_string();

    // Build options from voice parameter (if provided, it overrides config defaults)
    let options = if let Some(v) = voice {
        Some(TTSSpeakOptions::Preset {
            text: trimmed.clone(),
            voice: Some(v),
        })
    } else {
        None // Provider will use config defaults
    };

    let app2 = app.clone();
    let config2 = config.clone();

    // Spawn the actual TTS processing on a background task
    // This keeps the command return fast — the Channel handles streaming
    tauri::async_runtime::spawn(async move {
        let tts_manager = crate::tts::TtsManager::with_abort_flag(abort_flag);

        match tts_manager
            .process_request(&trimmed, options, &config2, &on_event, &app2)
            .await
        {
            Ok((total, duration_ms)) => {
                let _ = on_event.send(TtsStreamEvent::finished(total, duration_ms));
                let _ = app2.emit("tts:state", TTSPlayState::Idle);
            }
            Err(e) => {
                let err_msg = e.to_string();
                let recoverable = !err_msg.contains("Aborted by user");
                let _ = on_event.send(TtsStreamEvent::error(&err_msg, recoverable));
                let _ = app2.emit(
                    "tts:state",
                    TTSPlayState::Error {
                        request_id: None,
                        message: err_msg,
                    },
                );
            }
        }
    });

    Ok(())
}

/// Stop current TTS playback — sets abort flag checked by the background task.
#[tauri::command]
pub fn tts_stop(app: AppHandle) -> Result<(), AppError> {
    let state = app.state::<Mutex<AppState>>();
    let guard = state.lock().map_err(|e| AppError::Tts(format!("Lock error: {e}")))?;
    guard.tts_manager.stop();

    let _ = app.emit("tts:state", TTSPlayState::Stopped);
    tracing::info!("[TTS] Stopped by user");
    Ok(())
}

/// Get current TTS configuration
#[tauri::command]
pub fn tts_get_config(app: AppHandle) -> Result<TTSConfig, AppError> {
    let state = app.state::<Mutex<AppState>>();
    let guard = state.lock().map_err(|e| AppError::Tts(format!("Lock error: {e}")))?;
    Ok(guard.tts_config.clone())
}

/// Update TTS configuration.
#[tauri::command]
pub fn tts_set_config(app: AppHandle, config: TTSConfig) -> Result<(), AppError> {
    let source = config.source.clone();
    let enabled = config.enabled;

    let store = app
        .store("settings.json")
        .map_err(|e| AppError::Tts(format!("Store error: {e}")))?;
    let value = serde_json::to_value(&config)
        .map_err(|e| AppError::Tts(format!("Config serialization error: {e}")))?;
    store.set("tts_config", value);
    if let Err(e) = store.save() {
        tracing::warn!("[TTS] Could not save config to store: {e}");
    }

    let state = app.state::<Mutex<AppState>>();
    let mut guard = state.lock().map_err(|e| AppError::Tts(format!("Lock error: {e}")))?;
    guard.tts_config = config.clone();
    // Broadcast config change
    let _ = app.emit("tts:config", config);
    tracing::info!(
        "[TTS] Config updated: source={:?} enabled={}",
        source,
        enabled
    );
    Ok(())
}

/// Get available voices for a provider (stub — returns empty for now).
/// Full implementation requires provider-specific voice listing.
#[tauri::command]
pub fn tts_get_voices(_app: AppHandle, _provider: String) -> Result<Vec<String>, AppError> {
    // System TTS voices require platform-specific queries.
    // Cloud provider voices require API calls.
    // For now, return empty — Phase 6 will wire this to the full config UI.
    Ok(Vec::new())
}
