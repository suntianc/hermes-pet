use serde::{Deserialize, Serialize};

// ── Planner Mode ────────────────────────────────────────────────────────────

/// Three operational modes for the AI planner.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum PlannerMode {
    /// Deterministic rule-based planning only — no LLM calls.
    #[serde(rename = "rule")]
    Rule,
    /// LLM-driven planning via OpenAI function calling.
    #[serde(rename = "ai")]
    Ai,
    /// LLM planning with rule-based fallback when the LLM is unreachable.
    #[serde(rename = "hybrid")]
    Hybrid,
}

impl PlannerMode {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Rule => "rule",
            Self::Ai => "ai",
            Self::Hybrid => "hybrid",
        }
    }
}

impl Default for PlannerMode {
    fn default() -> Self {
        Self::Hybrid
    }
}

// ── AI Config ───────────────────────────────────────────────────────────────

/// Persisted AI planner configuration (stored via tauri-plugin-store).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiConfig {
    /// Master enable/disable switch.
    pub enabled: bool,
    /// Current planner mode.
    pub mode: PlannerMode,
    /// OpenAI-compatible base URL (e.g. https://api.openai.com/v1).
    pub base_url: String,
    /// API key for the OpenAI-compatible endpoint.
    pub api_key: String,
    /// Model name (e.g. gpt-4o-mini).
    pub model: String,
    /// Timeout for OpenAI API calls in milliseconds.
    pub timeout_ms: u64,
    /// Whether to fall back to rule-based planning when the LLM call fails.
    pub fallback_to_rule: bool,
}

impl Default for AiConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            mode: PlannerMode::Hybrid,
            base_url: "https://api.openai.com/v1".into(),
            api_key: String::new(),
            model: "gpt-4o-mini".into(),
            timeout_ms: 8000,
            fallback_to_rule: true,
        }
    }
}

// ── Function Definitions (used in OpenAI tool calling) ──────────────────────

/// Returns the tool definition array used for OpenAI function calling.
pub fn ai_behavior_tools() -> Vec<serde_json::Value> {
    serde_json::json!([
        {
            "type": "function",
            "function": {
                "name": "pet_noop",
                "description": "Keep the current pet behavior unchanged for noisy, repeated, or low-value events.",
                "parameters": {
                    "type": "object",
                    "additionalProperties": false,
                    "properties": {
                        "reason": { "type": "string" }
                    }
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "pet_set_action",
                "description": "Choose the visible semantic pose for the pet.",
                "parameters": {
                    "type": "object",
                    "additionalProperties": false,
                    "required": ["pose"],
                    "properties": {
                        "pose": {
                            "type": "string",
                            "enum": ["idle", "thinking", "speaking", "searching", "reading", "coding", "terminal", "testing", "waiting_user", "success", "error", "happy"]
                        },
                        "playback": {
                            "type": "string",
                            "enum": ["hold", "momentary"]
                        },
                        "intensity": {
                            "type": "number",
                            "minimum": 0.0,
                            "maximum": 1.0
                        },
                        "interrupt": { "type": "boolean" },
                        "reason": { "type": "string" }
                    }
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "pet_say",
                "description": "Show a short Chinese speech bubble for the pet.",
                "parameters": {
                    "type": "object",
                    "additionalProperties": false,
                    "required": ["text"],
                    "properties": {
                        "text": { "type": "string" },
                        "tts": { "type": "boolean" }
                    }
                }
            }
        }
    ])
    .as_array()
    .cloned()
    .unwrap_or_default()
}
