//! Model Import — File dialog + file copy
//!
//! Provides the native file dialog for selecting `.riv` files,
//! copies the selected file into the app data directory, and
//! writes a `.vivipet-registry.json` metadata file.

use std::fs;
use std::path::Path;

use tauri::AppHandle;

use crate::error::AppError;

use super::{get_models_dir, to_model_id, write_registry, ModelConfig, WindowSize};

/// Open a native file dialog filtered for `.riv` files, then import the
/// selected model into the app data directory.
///
/// Returns `Ok(Some(config))` on successful import,
/// `Ok(None)` if the dialog was cancelled,
/// `Err(e)` on error.
pub fn import_model_via_dialog(app: &AppHandle) -> Result<Option<ModelConfig>, AppError> {
    // ── 1. Show native file dialog ───────────────────────────────────
    use tauri_plugin_dialog::DialogExt;

    let file = app
        .dialog()
        .file()
        .add_filter("Rive Model (.riv)", &["riv"])
        .blocking_pick_file();

    let file_path = match file {
        Some(path) => path
            .into_path()
            .map_err(|e| AppError::Model(format!("Failed to resolve file path: {e}")))?,
        None => {
            tracing::info!("[Model::Import] File dialog cancelled");
            return Ok(None);
        }
    };

    // ── 2. Validate as .riv ──────────────────────────────────────────
    let extension = file_path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("");

    if extension.to_lowercase() != "riv" {
        return Err(AppError::Model(
            "Selected file is not a .riv file".to_string(),
        ));
    }

    tracing::info!("[Model::Import] Selected file: {file_path:?}");
    import_model_from_path(app, &file_path)
}

/// Import a model from an absolute file path.
///
/// Copies the `.riv` file into `{app_data}/models/<modelId>/model.riv`
/// and writes `.vivipet-registry.json` for future discovery.
pub fn import_model_from_path(app: &AppHandle, source_path: &Path) -> Result<Option<ModelConfig>, AppError> {
    if !source_path.exists() {
        return Err(AppError::Model(format!(
            "Source file not found: {source_path:?}"
        )));
    }

    // ── 3. Derive model identity from filename ────────────────────────
    let file_stem = source_path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("imported_model");

    let model_id = to_model_id(file_stem);
    let display_name = file_stem.to_string();

    // ── 4. Create target directory ────────────────────────────────────
    let models_dir = get_models_dir(app)?;
    let model_dir = models_dir.join(&model_id);
    fs::create_dir_all(&model_dir)
        .map_err(|e| AppError::Model(format!("Failed to create model directory: {e}")))?;

    // ── 5. Copy .riv file to model.riv ────────────────────────────────
    let dest_path = model_dir.join("model.riv");
    fs::copy(source_path, &dest_path).map_err(|e| {
        AppError::Model(format!(
            "Failed to copy .riv file from {source_path:?} to {dest_path:?}: {e}"
        ))
    })?;

    // ── 6. Determine the path string the frontend will use ────────────
    // Store as absolute filesystem path — the frontend (via @tauri-apps/api)
    // will use convertFileSrc() to resolve it to a URL the webview can load.
    let model_path_str = dest_path.to_string_lossy().to_string();

    // ── 7. Write .vivipet-registry.json ───────────────────────────────
    write_registry(&model_dir, &model_id, &display_name, &model_path_str)?;

    tracing::info!(
        "[Model::Import] Imported model '{model_id}' from {source_path:?} → {dest_path:?}"
    );

    // ── 8. Return ModelConfig ─────────────────────────────────────────
    Ok(Some(ModelConfig {
        id: model_id,
        name: display_name,
        path: model_path_str,
        model_type: Some("rive".to_string()),
        window: Some(WindowSize {
            width: 520,
            height: 760,
        }),
        canvas: Some(WindowSize {
            width: 520,
            height: 760,
        }),
        actions: None,
        capabilities: None,
    }))
}
