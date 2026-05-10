use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};
use tauri_plugin_store::StoreExt;

use crate::ai::{
    AiConfig, AiPlanner, BehaviorPlan, RuleContext, RuleEvent,
};
use crate::error::AppError;
use crate::state::AppState;

// ── Request / Response Types ────────────────────────────────────────────────

/// Input to the ai_plan command.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiPlanRequest {
    pub event: RuleEvent,
    pub context: RuleContext,
}

/// Result returned from the ai_plan command.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiPlanResponse {
    pub ok: bool,
    pub plan: Option<BehaviorPlan>,
    pub mode: String,
    pub error: Option<String>,
}

// ── Commands ────────────────────────────────────────────────────────────────

/// Plan a pet behavior using the configured AI planner mode.
///
/// Accepts an event description and context, returns a structured BehaviorPlan.
/// The mode (rule/ai/hybrid) is determined by the current AiConfig.
#[tauri::command]
pub async fn ai_plan(
    app: AppHandle,
    request: AiPlanRequest,
) -> Result<AiPlanResponse, AppError> {
    let (planner, mode) = {
        let state = app.state::<Mutex<AppState>>();
        let guard = state.lock().map_err(|e| AppError::Ai(format!("Lock error: {e}")))?;
        (
            guard.ai_planner.clone(),
            guard.ai_config.mode.clone(),
        )
    };

    let mode_str = mode.as_str().to_string();

    match planner.plan(&request.event, &request.context).await {
        Ok(plan) => Ok(AiPlanResponse {
            ok: true,
            plan: Some(plan),
            mode: mode_str,
            error: None,
        }),
        Err(e) => {
            tracing::warn!("[AiPlanner] plan failed: {:#}", e);
            Ok(AiPlanResponse {
                ok: false,
                plan: None,
                mode: mode_str,
                error: Some(e.to_string()),
            })
        }
    }
}

/// Get the current AI planner configuration.
#[tauri::command]
pub fn ai_get_config(app: AppHandle) -> Result<AiConfig, AppError> {
    let state = app.state::<Mutex<AppState>>();
    let guard = state.lock().map_err(|e| AppError::Ai(format!("Lock error: {e}")))?;
    Ok(guard.ai_config.clone())
}

/// Update the AI planner configuration and persist to store.
#[tauri::command]
pub fn ai_set_config(app: AppHandle, config: AiConfig) -> Result<(), AppError> {
    let state = app.state::<Mutex<AppState>>();
    let mut guard = state.lock().map_err(|e| AppError::Ai(format!("Lock error: {e}")))?;

    // Update both the config and the planner's internal config
    guard.ai_config = config.clone();
    guard.ai_planner = AiPlanner::new(config.clone());

    // Persist via tauri-plugin-store
    let store = match app.store("settings.json") {
        Ok(s) => s,
        Err(e) => {
            tracing::warn!("[AiPlanner] Could not open settings store: {e}");
            return Err(AppError::Ai(format!("Store error: {e}")));
        }
    };

    let value = serde_json::to_value(&config).map_err(|e| {
        AppError::Ai(format!("Config serialization error: {e}"))
    })?;
    store.set("ai_config", value);
    if let Err(e) = store.save() {
        tracing::warn!("[AiPlanner] Could not save config to store: {e}");
    }

    tracing::info!(
        "[AiPlanner] Config updated: mode={} enabled={}",
        config.mode.as_str(),
        config.enabled
    );

    Ok(())
}

/// Test the OpenAI connection. Returns success or error details.
/// Uses current config unless overrides are provided.
#[tauri::command]
pub async fn ai_test_connection(
    app: AppHandle,
    config_override: Option<AiConfig>,
) -> Result<String, AppError> {
    let planner = {
        let state = app.state::<Mutex<AppState>>();
        let guard = state.lock().map_err(|e| AppError::Ai(format!("Lock error: {e}")))?;
        guard.ai_planner.clone()
    };

    match planner.test_connection(config_override).await {
        Ok(_) => Ok("Connection successful".to_string()),
        Err(e) => Err(AppError::Ai(format!("Connection failed: {e}"))),
    }
}
