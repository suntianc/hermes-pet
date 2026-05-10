use std::sync::Mutex;

pub struct AppState {
    /// Placeholder for future state fields
    pub initialized: Mutex<bool>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            initialized: Mutex::new(true),
        }
    }
}
