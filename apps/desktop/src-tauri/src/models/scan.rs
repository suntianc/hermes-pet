//! Model Directory Scanning
//!
//! Scans the models directory and discovers imported models
//! by reading `.vivipet-registry.json` files. Each model directory created
//! during import contains a registry file with metadata.

use std::fs;
use std::path::Path;

use super::{ModelConfig, VivipetRegistry};

/// Scan a directory for model subdirectories containing `.vivipet-registry.json`.
///
/// This function walks one level deep into `models_dir` looking for subdirectories.
/// Each subdirectory is expected to have a `.vivipet-registry.json` file created
/// during `import_model_via_dialog`. If the registry is missing or invalid, the
/// directory is silently skipped (one bad model should not block all models).
///
/// Returns a `Vec<ModelConfig>` sorted by model name.
pub fn scan_models_dir(models_dir: &Path) -> Result<Vec<ModelConfig>, crate::error::AppError> {
    if !models_dir.exists() {
        return Ok(Vec::new());
    }

    let mut models: Vec<ModelConfig> = Vec::new();

    // Walk one level deep — we only care about direct subdirectories of models_dir
    let entries = match fs::read_dir(models_dir) {
        Ok(entries) => entries,
        Err(e) => {
            tracing::warn!("[Model::Scan] Failed to read models dir: {e}");
            return Ok(Vec::new());
        }
    };

    for entry in entries.flatten() {
        let path = entry.path();

        // Skip non-directories
        if !path.is_dir() {
            continue;
        }

        // Look for .vivipet-registry.json inside the model directory
        let registry_path = path.join(".vivipet-registry.json");
        if !registry_path.exists() {
            // No registry file — this directory is not a valid model
            // (could be a leftover or manual addition)
            tracing::debug!("[Model::Scan] Skipping {path:?} — no .vivipet-registry.json");
            continue;
        }

        // Parse the registry file
        match parse_registry(&registry_path) {
            Some(config) => models.push(config),
            None => {
                // Per RESEARCH Pitfall 5: one bad registry should not block all user models
                tracing::warn!(
                    "[Model::Scan] Skipping bad registry: {registry_path:?}"
                );
            }
        }
    }

    // Sort alphabetically by name for consistent ordering
    models.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));

    tracing::info!("[Model::Scan] Found {} model(s)", models.len());
    Ok(models)
}

/// Parse a `.vivipet-registry.json` file and convert to `ModelConfig`.
/// Returns `None` if parsing fails.
fn parse_registry(path: &Path) -> Option<ModelConfig> {
    let content = fs::read_to_string(path).ok()?;
    let registry: VivipetRegistry = serde_json::from_str(&content).ok()?;

    // Validate required fields
    if registry.id.is_empty() || registry.name.is_empty() || registry.path.is_empty() {
        tracing::warn!(
            "[Model::Scan] Registry at {path:?} has empty required fields (id/name/path)"
        );
        return None;
    }

    Some(ModelConfig::from(registry))
}
