use serde::Serialize;

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("{0}")]
    Window(String),
    #[error("{0}")]
    Tray(String),
    #[error("{0}")]
    Logging(String),
    #[error("Adapter error: {0}")]
    Adapter(String),
    #[error("TTS error: {0}")]
    Tts(String),
    #[error("Config error: {0}")]
    Config(String),
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(self.to_string().as_ref())
    }
}
