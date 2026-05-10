//! Model Management Tauri Commands
//!
//! These commands are invoked from the frontend via `@tauri-apps/api/core::invoke()`.
//!
//! | Command           | Description                                     |
//! |-------------------|-------------------------------------------------|
//! | `model_list`      | List all imported models                        |
//! | `model_import`    | Open file dialog and import a .riv file         |
//! | `model_refresh_scan` | Re-scan models directory and return list     |
//! | `model_remove`    | Remove a model by ID                            |

use tauri::AppHandle;

use crate::error::AppError;
use crate::models;

/// List all imported models.
///
/// Scans the app data models directory for `.vivipet-registry.json` files
/// and returns their parsed contents as `ModelConfig` array.
#[tauri::command]
pub fn model_list(app: AppHandle) -> Result<Vec<models::ModelConfig>, AppError> {
    tracing::info!("[Command] model_list");
    models::list_models(&app)
}

/// Import a Rive model via native file dialog.
///
/// Opens a file picker filtered to `.riv` files. If the user selects a file,
/// it is copied to `{app_data}/models/<id>/model.riv` and a registry file
/// is created.
///
/// Returns `Some(ModelConfig)` on success, `None` if cancelled.
#[tauri::command]
pub fn model_import(app: AppHandle) -> Result<Option<models::ModelConfig>, AppError> {
    tracing::info!("[Command] model_import");
    models::import_model(&app)
}

/// Re-scan the models directory and return the updated model list.
///
/// Useful after manual file operations or to refresh the frontend state.
#[tauri::command]
pub fn model_refresh_scan(app: AppHandle) -> Result<Vec<models::ModelConfig>, AppError> {
    tracing::info!("[Command] model_refresh_scan");
    models::list_models(&app)
}

/// Remove a model by ID.
///
/// Deletes the model's directory (`{app_data}/models/<id>/`) and all
/// its contents, including the `.vivipet-registry.json`.
#[tauri::command]
pub fn model_remove(app: AppHandle, id: String) -> Result<(), AppError> {
    tracing::info!("[Command] model_remove: {id}");
    models::remove_model(&app, &id)
}
