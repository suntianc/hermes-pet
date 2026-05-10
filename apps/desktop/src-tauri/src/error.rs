#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("{0}")]
    Window(String),
    #[error("{0}")]
    Tray(String),
    #[error("{0}")]
    Logging(String),
}

impl serde::Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(self.to_string().as_ref())
    }
}
