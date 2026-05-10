//! Axum route handlers for the adapter HTTP server.
//!
//! Endpoints:
//! - `POST /adapter` — receive agent events, normalize, emit to WebView
//! - `GET /adapter/capabilities` — return available phases and features

use axum::{
    extract::State,
    http::{Method, StatusCode, Uri},
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use serde_json::json;
use tauri::{AppHandle, Emitter};

use crate::adapter::events::{
    self, build_capabilities, normalize_agent_event, to_pet_state_event,
    AdapterErrorResponse, AdapterResponse,
};

/// Build the axum Router with shared AppHandle state.
///
/// Routes:
/// - `POST /adapter` — accepts agent events, emits to WebView
/// - `GET /adapter/capabilities` — returns capabilities JSON
/// - `OPTIONS *` — CORS preflight
/// - All other routes — 404
pub fn build_router(app_handle: AppHandle) -> Router {
    Router::new()
        .route("/adapter", post(handle_adapter))
        .route("/adapter/capabilities", get(handle_capabilities))
        .fallback(handle_404)
        .with_state(app_handle)
}

/// Handle POST /adapter — receive agent event, normalize, emit to WebView.
async fn handle_adapter(
    State(app_handle): State<AppHandle>,
    body: Option<Json<serde_json::Value>>,
) -> impl IntoResponse {
    // CORS preflight is handled by the OPTIONS fallback, but CORS headers
    // must be present on all responses. The POST handler is not preflighted
    // unless it has special headers, but we add them for consistency.

    // Parse body
    let payload = match body {
        Some(Json(val)) => val,
        None => json!({}),
    };

    // Normalize the agent event
    let agent_event = normalize_agent_event(payload);

    // Convert to pet state event
    match to_pet_state_event(&agent_event) {
        Some(pet_event) => {
            // Emit to WebView
            let emit_result = app_handle.emit("pet:event", &pet_event);

            if let Err(e) = emit_result {
                tracing::warn!("[Adapter] Failed to emit pet:event: {e}");
            } else {
                tracing::info!(
                    "[Adapter] pet:event emitted — action={} agent={}",
                    pet_event.action,
                    agent_event.agent,
                );
            }

            // Build response with CORS headers
            let response = AdapterResponse {
                ok: true,
                version: events::ADAPTER_VERSION.to_string(),
                event: Some(pet_event),
            };

            let mut resp = Json(response).into_response();
            add_cors_headers(&mut resp);
            resp
        }
        None => {
            let error_msg = format!("Unknown adapter phase: {:?}", agent_event.phase);
            tracing::warn!("[Adapter] {error_msg}");

            let err_resp = AdapterErrorResponse {
                ok: false,
                error: error_msg,
            };

            let mut resp = (StatusCode::BAD_REQUEST, Json(err_resp)).into_response();
            add_cors_headers(&mut resp);
            resp
        }
    }
}

/// Handle GET /adapter/capabilities — return capabilities JSON.
async fn handle_capabilities(State(_app_handle): State<AppHandle>) -> impl IntoResponse {
    let caps = build_capabilities();
    let mut resp = Json(caps).into_response();
    add_cors_headers(&mut resp);
    resp
}

/// Handle OPTIONS and unmatched routes.
async fn handle_404(method: Method, uri: Uri) -> impl IntoResponse {
    if method == Method::OPTIONS {
        // CORS preflight
        let mut resp = (StatusCode::NO_CONTENT, ()).into_response();
        add_cors_headers_preflight(&mut resp);
        return resp;
    }

    let err_resp = AdapterErrorResponse {
        ok: false,
        error: format!("Not found: {} {}", method, uri),
    };

    let mut resp = (StatusCode::NOT_FOUND, Json(err_resp)).into_response();
    add_cors_headers(&mut resp);
    resp
}

/// Add CORS headers to a response.
fn add_cors_headers(resp: &mut axum::response::Response) {
    let headers = resp.headers_mut();
    headers.insert(
        "Access-Control-Allow-Origin",
        "*".parse().unwrap(),
    );
    headers.insert(
        "Access-Control-Allow-Headers",
        "content-type".parse().unwrap(),
    );
    headers.insert(
        "Access-Control-Allow-Methods",
        "GET, POST, OPTIONS".parse().unwrap(),
    );
}

/// Add CORS preflight headers for OPTIONS responses.
fn add_cors_headers_preflight(resp: &mut axum::response::Response) {
    let headers = resp.headers_mut();
    headers.insert(
        "Access-Control-Allow-Origin",
        "*".parse().unwrap(),
    );
    headers.insert(
        "Access-Control-Allow-Headers",
        "content-type".parse().unwrap(),
    );
    headers.insert(
        "Access-Control-Allow-Methods",
        "GET, POST, OPTIONS".parse().unwrap(),
    );
    headers.insert(
        "Access-Control-Max-Age",
        "86400".parse().unwrap(),
    );
}
