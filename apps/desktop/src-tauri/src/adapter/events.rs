//! Adapter protocol types — event schema, normalization, and policy dispatch.
//!
//! Ported from the Electron adapter:
//! - `protocol.ts` — event type definitions
//! - `normalize.ts` — field aliasing and normalization
//! - `policy.ts` — phase/action to pet state mapping

use serde::{Deserialize, Serialize};

/// Current adapter protocol version.
pub const ADAPTER_VERSION: &str = "adapter.v1";

// ─── Agent Event Types ───────────────────────────────────────────────────────
// These types describe events received from external agents via POST /adapter.

/// Agent lifecycle phases.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum AgentEventPhase {
    #[serde(rename = "idle")]
    Idle,
    #[serde(rename = "thinking")]
    Thinking,
    #[serde(rename = "speaking")]
    Speaking,
    #[serde(rename = "tool:start")]
    ToolStart,
    #[serde(rename = "tool:success")]
    ToolSuccess,
    #[serde(rename = "tool:error")]
    ToolError,
    #[serde(rename = "task:done")]
    TaskDone,
    #[serde(rename = "session:start")]
    SessionStart,
    #[serde(rename = "session:update")]
    SessionUpdate,
    #[serde(rename = "session:end")]
    SessionEnd,
    #[serde(rename = "message")]
    Message,
    #[serde(other)]
    Unknown,
}

/// TTS options that can be sent with an agent event.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentTTSOptions {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub enabled: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub voice: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub instruct: Option<String>,
}

/// Raw agent event received from POST /adapter.
///
/// After normalization (which accepts many field aliases), this is the canonical form.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentEvent {
    /// Protocol version (always "adapter.v1").
    pub version: String,
    /// Agent name (e.g., "hermes", "claude", "manual").
    pub agent: String,
    /// Current agent lifecycle phase.
    pub phase: AgentEventPhase,
    /// Optional explicit action override (e.g., "searching", "coding").
    #[serde(skip_serializing_if = "Option::is_none")]
    pub action: Option<String>,
    /// Tool or action kind (e.g., "search", "code", "read").
    #[serde(skip_serializing_if = "Option::is_none")]
    pub kind: Option<String>,
    /// Session identifier for grouping related events.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub session_id: Option<String>,
    /// Text content (primary speech text).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    /// Message content (secondary text).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
    /// Error description.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    /// Task summary text.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub summary: Option<String>,
    /// Time-to-live for this event in milliseconds.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ttl_ms: Option<u64>,
    /// Priority level (higher = more important).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub priority: Option<i32>,
    /// Log level for the event.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub level: Option<String>,
    /// TTS configuration (boolean to enable, or object with options).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tts: Option<serde_json::Value>,
    /// Arbitrary metadata attached to the event.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub metadata: Option<serde_json::Value>,
    /// Raw payload for debugging.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub raw: Option<serde_json::Value>,
}

// ─── Pet State Event Types ───────────────────────────────────────────────────
// These types describe what the pet should display/do. Emitted as "pet:event"
// to the WebView.

/// Pet animation state mode.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum PetStateMode {
    #[serde(rename = "continuous")]
    Continuous,
    #[serde(rename = "momentary")]
    Momentary,
    #[serde(rename = "context")]
    Context,
}

/// Source info attached to pet state events.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PetStateSource {
    pub agent: String,
    pub phase: AgentEventPhase,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub kind: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub session_id: Option<String>,
}

/// The pet state event, emitted to the WebView via `app.emit("pet:event", ...)`.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PetStateEvent {
    pub version: String,
    pub action: String,
    pub mode: PetStateMode,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reset_after_ms: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ttl_ms: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub priority: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tts: Option<serde_json::Value>,
    pub source: PetStateSource,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub metadata: Option<serde_json::Value>,
}

// ─── Adapter API Response Types ──────────────────────────────────────────────

/// Response from POST /adapter on success.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AdapterResponse {
    pub ok: bool,
    pub version: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub event: Option<PetStateEvent>,
}

/// Error response from POST /adapter.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AdapterErrorResponse {
    pub ok: bool,
    pub error: String,
}

/// GET /adapter/capabilities response.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AdapterCapabilities {
    pub ok: bool,
    pub version: String,
    pub service: String,
    pub capabilities: CapabilitiesDetail,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CapabilitiesDetail {
    pub states: Vec<&'static str>,
    pub phases: Vec<&'static str>,
    pub speech: bool,
    pub tts: bool,
    pub tts_control: TtsControlInfo,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TtsControlInfo {
    pub field: &'static str,
    pub default: bool,
    pub fallback_to_bubble: bool,
    pub accepted_values: Vec<&'static str>,
}

/// Build the capabilities response for GET /adapter/capabilities.
pub fn build_capabilities() -> AdapterCapabilities {
    AdapterCapabilities {
        ok: true,
        version: ADAPTER_VERSION.to_string(),
        service: "vivipet-adapter".to_string(),
        capabilities: CapabilitiesDetail {
            states: vec![
                "idle",
                "thinking",
                "speaking",
                "searching",
                "reading",
                "coding",
                "terminal",
                "testing",
                "waiting_user",
                "success",
                "error",
                "happy",
            ],
            phases: vec![
                "idle",
                "thinking",
                "speaking",
                "tool:start",
                "tool:success",
                "tool:error",
                "task:done",
                "session:start",
                "session:update",
                "session:end",
                "message",
            ],
            speech: true,
            tts: true,
            tts_control: TtsControlInfo {
                field: "tts",
                default: false,
                fallback_to_bubble: true,
                accepted_values: vec!["boolean", "options.enabled"],
            },
        },
    }
}

// ─── Normalization ───────────────────────────────────────────────────────────
// Ported from electron/adapter/normalize.ts

/// Phase aliases: snake_case → kebab-case, and other mappings from agent SDKs.
fn normalize_phase(value: Option<&str>) -> AgentEventPhase {
    let key = value.unwrap_or("").trim().to_lowercase();
    if key.is_empty() {
        return AgentEventPhase::Unknown;
    }
    match key.as_str() {
        "idle" => AgentEventPhase::Idle,
        "thinking" => AgentEventPhase::Thinking,
        "speaking" => AgentEventPhase::Speaking,
        "message" => AgentEventPhase::Message,
        "tool_start" | "tool:start" | "pre_tool_call" => AgentEventPhase::ToolStart,
        "tool_success" | "tool:success" | "post_tool_call" => AgentEventPhase::ToolSuccess,
        "tool_error" | "tool:error" => AgentEventPhase::ToolError,
        "task_done" | "task:done" | "agent_end" => AgentEventPhase::TaskDone,
        "session_start" | "session:start" | "on_session_start" => AgentEventPhase::SessionStart,
        "session_update" | "session:update" => AgentEventPhase::SessionUpdate,
        "session_end" | "session:end" | "on_session_end" | "on_session_finalize" => {
            AgentEventPhase::SessionEnd
        }
        "post_llm_call" => AgentEventPhase::Speaking,
        "pre_llm_call" => AgentEventPhase::Thinking,
        "agent_start" => AgentEventPhase::Thinking,
        _ => AgentEventPhase::Unknown,
    }
}

/// Normalize the TTS field: accepts boolean or object.
fn normalize_tts(value: &serde_json::Value) -> Option<serde_json::Value> {
    if value.is_boolean() || value.is_object() {
        Some(value.clone())
    } else {
        None
    }
}

/// Normalize a raw adapter payload into a canonical AgentEvent.
///
/// Accepts many field aliases for compatibility with different agent SDKs.
pub fn normalize_agent_event(payload: serde_json::Value) -> AgentEvent {
    let obj = match payload.as_object() {
        Some(map) => map,
        None => {
            return AgentEvent {
                version: ADAPTER_VERSION.to_string(),
                agent: "external".to_string(),
                phase: AgentEventPhase::Unknown,
                action: None,
                kind: None,
                session_id: None,
                text: None,
                message: None,
                error: None,
                summary: None,
                ttl_ms: None,
                priority: None,
                level: None,
                tts: None,
                metadata: None,
                raw: Some(payload),
            };
        }
    };

    // Helper to extract a string field from multiple possible keys
    let get_str = |keys: &[&str]| -> Option<String> {
        for key in keys {
            if let Some(val) = obj.get(*key) {
                if let Some(s) = val.as_str() {
                    if !s.trim().is_empty() {
                        return Some(s.to_string());
                    }
                }
            }
        }
        None
    };

    let get_finite_u64 = |keys: &[&str]| -> Option<u64> {
        for key in keys {
            if let Some(val) = obj.get(*key) {
                if let Some(n) = val.as_f64() {
                    if n.is_finite() && n >= 0.0 {
                        return Some(n as u64);
                    }
                }
            }
        }
        None
    };

    let get_finite_i32 = |keys: &[&str]| -> Option<i32> {
        for key in keys {
            if let Some(val) = obj.get(*key) {
                if let Some(n) = val.as_f64() {
                    if n.is_finite() {
                        return Some(n as i32);
                    }
                }
            }
        }
        None
    };

    let phase_val = get_str(&["phase", "type", "event", "hook_event_name"]);
    let phase = normalize_phase(phase_val.as_deref());

    // Determine agent name
    let agent = get_str(&["agent", "source"]).unwrap_or_else(|| {
        if obj.get("hook_event_name").is_some() {
            "hermes".to_string()
        } else {
            "external".to_string()
        }
    });

    // Extract data sub-object if present
    let data = obj
        .get("data")
        .and_then(|v| v.as_object())
        .cloned()
        .unwrap_or_default();

    let kind = get_str(&["kind", "tool", "tool_name"])
        .or_else(|| get_str_from_map(&data, &["tool_name", "tool"]));
    let text = get_str(&["text"])
        .or_else(|| get_str_from_map(&data, &["text"]));
    let message = get_str(&["message"])
        .or_else(|| get_str_from_map(&data, &["message"]));
    let error = get_str(&["error"]).or_else(|| get_str_from_map(&data, &["error"]));
    let summary = get_str(&["summary"]).or_else(|| get_str_from_map(&data, &["summary"]));

    let session_id = get_str(&["sessionId", "session_id"])
        .or_else(|| get_str_from_map(&data, &["session_id", "sessionId"]));

    let ttl_ms = get_finite_u64(&["ttlMs", "ttl_ms", "ttl"])
        .or_else(|| get_finite_u64_from_map(&data, &["ttlMs", "ttl_ms", "ttl"]));

    let priority = get_finite_i32(&["priority"])
        .or_else(|| get_finite_i32_from_map(&data, &["priority"]));

    let level = get_str(&["level"]).or_else(|| get_str_from_map(&data, &["level"]));

    let tts = obj
        .get("tts")
        .or_else(|| data.get("tts"))
        .and_then(normalize_tts);

    let metadata = if data.is_empty() {
        None
    } else {
        Some(serde_json::Value::Object(data.clone()))
    };

    AgentEvent {
        version: ADAPTER_VERSION.to_string(),
        agent,
        phase,
        action: get_str(&["action"]),
        kind,
        session_id,
        text,
        message,
        error,
        summary,
        ttl_ms,
        priority,
        level,
        tts,
        metadata,
        raw: Some(payload),
    }
}

// Helper functions for extracting values from a nested map
fn get_str_from_map(map: &serde_json::Map<String, serde_json::Value>, keys: &[&str]) -> Option<String> {
    for key in keys {
        if let Some(val) = map.get(*key) {
            if let Some(s) = val.as_str() {
                if !s.trim().is_empty() {
                    return Some(s.to_string());
                }
            }
        }
    }
    None
}

fn get_finite_u64_from_map(
    map: &serde_json::Map<String, serde_json::Value>,
    keys: &[&str],
) -> Option<u64> {
    for key in keys {
        if let Some(val) = map.get(*key) {
            if let Some(n) = val.as_f64() {
                if n.is_finite() && n >= 0.0 {
                    return Some(n as u64);
                }
            }
        }
    }
    None
}

fn get_finite_i32_from_map(
    map: &serde_json::Map<String, serde_json::Value>,
    keys: &[&str],
) -> Option<i32> {
    for key in keys {
        if let Some(val) = map.get(*key) {
            if let Some(n) = val.as_f64() {
                if n.is_finite() {
                    return Some(n as i32);
                }
            }
        }
    }
    None
}

// ─── Policy: AgentEvent → PetStateEvent ─────────────────────────────────────
// Ported from electron/adapter/policy.ts

/// Tool action → pet animation mapping.
pub fn tool_to_action(kind: Option<&str>) -> &'static str {
    match kind.unwrap_or("").trim().to_lowercase().as_str() {
        "search" | "searching" => "searching",
        "read" | "reading" => "reading",
        "code" | "coding" | "edit" | "patch" => "coding",
        "terminal" | "shell" | "bash" | "zsh" | "exec" | "command" => "terminal",
        "test" | "testing" => "testing",
        _ => "thinking",
    }
}

/// Direct actions that can be applied immediately.
pub fn is_direct_action(action: &str) -> bool {
    matches!(
        action,
        "idle"
            | "thinking"
            | "speaking"
            | "happy"
            | "angry"
            | "confused"
            | "surprised"
            | "searching"
            | "reading"
            | "coding"
            | "terminal"
            | "testing"
            | "waiting_user"
            | "success"
            | "error"
            | "sleep"
            | "wake"
            | "dragging"
            | "clicked"
            | "doubleClicked"
            | "rightClickMenu"
    )
}

/// Momentary actions that auto-reset, with their reset durations in ms.
pub fn momentary_reset(action: &str) -> Option<u64> {
    match action {
        "happy" => Some(3000),
        "success" => Some(2000),
        "error" => Some(3000),
        "clicked" => Some(300),
        "doubleClicked" => Some(500),
        _ => None,
    }
}

/// Get the speech/display text from an agent event.
fn speech_text(event: &AgentEvent) -> Option<String> {
    event
        .text
        .clone()
        .or_else(|| event.message.clone())
        .or_else(|| event.summary.clone())
        .or_else(|| event.error.clone())
}

/// Base PetStateEvent builder from an AgentEvent.
fn base_pet_event(event: &AgentEvent, action: &str, mode: PetStateMode) -> PetStateEvent {
    PetStateEvent {
        version: ADAPTER_VERSION.to_string(),
        action: action.to_string(),
        mode,
        reset_after_ms: None,
        text: speech_text(event),
        message: event.error.clone().or_else(|| event.message.clone()),
        ttl_ms: event.ttl_ms,
        priority: event.priority,
        tts: event.tts.clone(),
        source: PetStateSource {
            agent: event.agent.clone(),
            phase: event.phase.clone(),
            kind: event.kind.clone(),
            session_id: event.session_id.clone(),
        },
        metadata: event.metadata.clone(),
    }
}

/// Convert a normalized AgentEvent into a PetStateEvent for the WebView.
///
/// Returns None if the phase is unknown/unrecognized.
pub fn to_pet_state_event(event: &AgentEvent) -> Option<PetStateEvent> {
    // If agent event has an explicit direct action, use it
    if let Some(ref action) = event.action {
        if is_direct_action(action) {
            let reset = momentary_reset(action);
            let mode = if reset.is_some() {
                PetStateMode::Momentary
            } else {
                PetStateMode::Continuous
            };
            let mut pet = base_pet_event(event, action, mode);
            pet.reset_after_ms = reset;
            return Some(pet);
        }
    }

    // Otherwise, map from phase
    match event.phase {
        AgentEventPhase::Idle => Some(base_pet_event(event, "idle", PetStateMode::Continuous)),
        AgentEventPhase::Thinking
        | AgentEventPhase::SessionStart
        | AgentEventPhase::SessionUpdate => {
            Some(base_pet_event(event, "thinking", PetStateMode::Continuous))
        }
        AgentEventPhase::Speaking | AgentEventPhase::Message => {
            Some(base_pet_event(event, "speaking", PetStateMode::Continuous))
        }
        AgentEventPhase::ToolStart => {
            let action = tool_to_action(event.kind.as_deref());
            Some(base_pet_event(event, action, PetStateMode::Continuous))
        }
        AgentEventPhase::ToolSuccess => {
            Some(base_pet_event(event, "keep", PetStateMode::Context))
        }
        AgentEventPhase::ToolError => {
            let mut pet = base_pet_event(event, "error", PetStateMode::Momentary);
            pet.reset_after_ms = Some(3000);
            Some(pet)
        }
        AgentEventPhase::TaskDone | AgentEventPhase::SessionEnd => {
            let mut pet = base_pet_event(event, "happy", PetStateMode::Momentary);
            pet.reset_after_ms = Some(3000);
            Some(pet)
        }
        AgentEventPhase::Unknown => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_normalize_basic_event() {
        let json = serde_json::json!({
            "agent": "test-agent",
            "phase": "thinking",
            "text": "Hello from test"
        });
        let event = normalize_agent_event(json);
        assert_eq!(event.agent, "test-agent");
        assert_eq!(event.phase, AgentEventPhase::Thinking);
        assert_eq!(event.text, Some("Hello from test".to_string()));
    }

    #[test]
    fn test_normalize_phase_aliases() {
        let test_cases = vec![
            ("tool_start", AgentEventPhase::ToolStart),
            ("tool:start", AgentEventPhase::ToolStart),
            ("pre_tool_call", AgentEventPhase::ToolStart),
            ("task_done", AgentEventPhase::TaskDone),
            ("session_end", AgentEventPhase::SessionEnd),
            ("agent_end", AgentEventPhase::TaskDone),
        ];

        for (input, expected) in test_cases {
            let json = serde_json::json!({ "agent": "test", "phase": input });
            let event = normalize_agent_event(json);
            assert_eq!(
                event.phase, expected,
                "Phase alias '{}' should map to {:?}",
                input, expected
            );
        }
    }

    #[test]
    fn test_unknown_phase_returns_none() {
        let json = serde_json::json!({
            "agent": "test",
            "phase": "nonexistent_phase"
        });
        let event = normalize_agent_event(json);
        assert_eq!(event.phase, AgentEventPhase::Unknown);
        let pet = to_pet_state_event(&event);
        assert!(pet.is_none());
    }

    #[test]
    fn test_thinking_to_pet_event() {
        let json = serde_json::json!({
            "agent": "test",
            "phase": "thinking",
            "text": "Thinking..."
        });
        let event = normalize_agent_event(json);
        let pet = to_pet_state_event(&event).unwrap();
        assert_eq!(pet.action, "thinking");
        assert_eq!(pet.text, Some("Thinking...".to_string()));
        assert!(matches!(pet.mode, PetStateMode::Continuous));
    }

    #[test]
    fn test_tool_start_maps_to_searching() {
        let json = serde_json::json!({
            "agent": "test",
            "phase": "tool:start",
            "kind": "search"
        });
        let event = normalize_agent_event(json);
        let pet = to_pet_state_event(&event).unwrap();
        assert_eq!(pet.action, "searching");
    }

    #[test]
    fn test_tool_error_momentary() {
        let json = serde_json::json!({
            "agent": "test",
            "phase": "tool:error",
            "error": "Something went wrong"
        });
        let event = normalize_agent_event(json);
        let pet = to_pet_state_event(&event).unwrap();
        assert_eq!(pet.action, "error");
        assert!(matches!(pet.mode, PetStateMode::Momentary));
        assert_eq!(pet.reset_after_ms, Some(3000));
    }

    #[test]
    fn test_task_done_happy() {
        let json = serde_json::json!({
            "agent": "test",
            "phase": "task:done",
            "summary": "Task completed successfully"
        });
        let event = normalize_agent_event(json);
        let pet = to_pet_state_event(&event).unwrap();
        assert_eq!(pet.action, "happy");
        assert!(matches!(pet.mode, PetStateMode::Momentary));
        assert_eq!(pet.reset_after_ms, Some(3000));
    }

    #[test]
    fn test_capabilities_build() {
        let caps = build_capabilities();
        assert!(caps.ok);
        assert_eq!(caps.version, "adapter.v1");
        assert_eq!(caps.service, "vivipet-adapter");
        assert!(caps.capabilities.tts);
        assert_eq!(caps.capabilities.tts_control.field, "tts");
        assert!(caps.capabilities.phases.contains(&"tool:start"));
        assert!(caps.capabilities.states.contains(&"thinking"));
    }

    #[test]
    fn test_normalize_empty_body() {
        let json = serde_json::json!({});
        let event = normalize_agent_event(json);
        assert_eq!(event.agent, "external");
        assert_eq!(event.phase, AgentEventPhase::Unknown);
    }
}
