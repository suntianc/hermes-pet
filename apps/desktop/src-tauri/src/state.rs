use std::sync::Mutex;

use crate::tts::config::TTSConfig;
use crate::tts::TtsManager;

pub struct AppState {
    pub initialized: Mutex<bool>,
    pub tts_config: TTSConfig,
    pub tts_manager: TtsManager,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            initialized: Mutex::new(true),
            tts_config: TTSConfig::default(),
            tts_manager: TtsManager::new(),
        }
    }
}
