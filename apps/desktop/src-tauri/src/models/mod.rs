//! Model Management Module
//!
//! This module handles importing, listing, scanning, and removing Rive (.riv) model files.
//! Models are stored in the app data directory under `models/<modelId>/` with a
//! `.vivipet-registry.json` metadata file per model.
//!
//! ## Module structure
//!
//! - `mod.rs` — Type definitions and top-level operations (list, import, remove)
//! - `scan.rs` — walkdir-based directory scanning for model discovery
//! - `import.rs` — Native file dialog + file copy for model import

pub mod import;
pub mod scan;

use std::fs;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

use crate::error::AppError;

// ── Types ──────────────────────────────────────────────────────────────

/// Window or canvas size configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WindowSize {
    pub width: u32,
    pub height: u32,
}

/// Motion sub-config (from the frontend `ModelActionConfig`)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MotionConfig {
    pub group: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub index: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file: Option<String>,
}

/// Model action configuration matching the frontend `ModelActionConfig`
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelActionConfig {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub motion: Option<MotionConfig>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expression: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expression_file: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reset_expression_after_ms: Option<u64>,
}

/// Model capability (expression and prop definitions)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelCapabilities {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expressions: Option<std::collections::HashMap<String, Option<String>>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub props: Option<std::collections::HashMap<String, ModelPropCapability>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub prop_fallbacks: Option<std::collections::HashMap<String, Vec<String>>>,
}

/// Property capability (enable/disable state machine input values)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelPropCapability {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub enable: Option<std::collections::HashMap<String, u32>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub disable: Option<std::collections::HashMap<String, u32>>,
}

/// Complete model configuration matching the frontend `ModelConfig` interface.
///
/// The `type` field is serialized as `"type"` in JSON to match the TS interface.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelConfig {
    pub id: String,
    pub name: String,
    pub path: String,
    #[serde(rename = "type")]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub window: Option<WindowSize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub canvas: Option<WindowSize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub actions: Option<std::collections::HashMap<String, ModelActionConfig>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub capabilities: Option<ModelCapabilities>,
}

/// The on-disk registry format in each model's `.vivipet-registry.json`
#[derive(Debug, Clone, Serialize, Deserialize)]
struct VivipetRegistry {
    id: String,
    name: String,
    path: String,
    #[serde(rename = "type")]
    #[serde(skip_serializing_if = "Option::is_none")]
    model_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    window: Option<WindowSize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    actions: Option<std::collections::HashMap<String, ModelActionConfig>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    capabilities: Option<ModelCapabilities>,
}

// ── Helpers ────────────────────────────────────────────────────────────

/// Get the models storage directory under the app data directory.
/// Creates it if it doesn't exist.
pub fn get_models_dir(app: &AppHandle) -> Result<PathBuf, AppError> {
    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|e| AppError::Model(format!("Failed to resolve app data dir: {e}")))?;

    let models_dir = app_data.join("models");
    fs::create_dir_all(&models_dir)
        .map_err(|e| AppError::Model(format!("Failed to create models dir: {e}")))?;

    Ok(models_dir)
}

/// Sanitize a model name to a safe filesystem ID.
/// Replaces non-alphanumeric characters (except `-`, `_`) with `_`.
fn to_model_id(name: &str) -> String {
    let sanitized: String = name
        .chars()
        .map(|c| if c.is_alphanumeric() || c == '-' || c == '_' { c } else { '_' })
        .collect();

    if sanitized.is_empty() {
        return "imported_model".to_string();
    }
    sanitized.to_lowercase()
}

// ── Top-level operations ───────────────────────────────────────────────

/// List all imported models by scanning the models directory.
/// Returns an empty vector if no models are found.
pub fn list_models(app: &AppHandle) -> Result<Vec<ModelConfig>, AppError> {
    let models_dir = get_models_dir(app)?;
    scan::scan_models_dir(&models_dir)
}

/// Import a model by opening a native file dialog.
/// Returns `Ok(None)` if the dialog was cancelled.
pub fn import_model(app: &AppHandle) -> Result<Option<ModelConfig>, AppError> {
    import::import_model_via_dialog(app)
}

/// Remove a model by ID (deletes its directory and registry).
pub fn remove_model(app: &AppHandle, id: &str) -> Result<(), AppError> {
    let models_dir = get_models_dir(app)?;
    let model_dir = models_dir.join(id);

    if !model_dir.exists() {
        return Err(AppError::Model(format!("Model '{id}' not found")));
    }

    fs::remove_dir_all(&model_dir)
        .map_err(|e| AppError::Model(format!("Failed to remove model '{id}': {e}")))?;

    tracing::info!("[Model] Removed model: {id}");
    Ok(())
}

/// Create a `.vivipet-registry.json` file for a model.
/// Called after importing a new `.riv` file.
pub(crate) fn write_registry(
    model_dir: &std::path::Path,
    id: &str,
    name: &str,
    file_path: &str,
) -> Result<(), AppError> {
    let registry = VivipetRegistry {
        id: id.to_string(),
        name: name.to_string(),
        path: file_path.to_string(),
        model_type: Some("rive".to_string()),
        window: None,
        actions: None,
        capabilities: None,
    };

    let registry_path = model_dir.join(".vivipet-registry.json");
    let json = serde_json::to_string_pretty(&registry)
        .map_err(|e| AppError::Model(format!("Failed to serialize registry: {e}")))?;

    fs::write(&registry_path, json)
        .map_err(|e| AppError::Model(format!("Failed to write registry: {e}")))?;

    Ok(())
}

// ── Registry-to-ModelConfig conversion ─────────────────────────────────

impl From<VivipetRegistry> for ModelConfig {
    fn from(r: VivipetRegistry) -> Self {
        let win = r.window.clone();
        Self {
            id: r.id,
            name: r.name,
            path: r.path,
            model_type: r.model_type,
            window: r.window,
            canvas: win.map(|w| WindowSize {
                width: w.width,
                height: w.height,
            }),
            actions: r.actions,
            capabilities: r.capabilities,
        }
    }
}

// Re-export for use in commands (used by commands/models.rs via crate::models::list_models etc.)
