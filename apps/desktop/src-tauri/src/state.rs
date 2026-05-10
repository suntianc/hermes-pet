use std::sync::Mutex;

use crate::adapter::lifecycle::AdapterLifecycle;
use crate::tts::config::TTSConfig;
use crate::tts::TtsManager;

pub struct AppState {
    pub initialized: Mutex<bool>,
    pub tts_config: TTSConfig,
    pub tts_manager: TtsManager,
    /// Adapter server lifecycle control.
    /// Set during setup(), cancelled on app exit.
    pub adapter_lifecycle: Mutex<Option<AdapterLifecycle>>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            initialized: Mutex::new(true),
            tts_config: TTSConfig::default(),
            tts_manager: TtsManager::new(),
            adapter_lifecycle: Mutex::new(None),
        }
    }
}
