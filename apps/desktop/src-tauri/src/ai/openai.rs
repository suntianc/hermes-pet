// ── OpenAI Chat Completions Client ──────────────────────────────────────────
//
// Non-streaming reqwest client for OpenAI-compatible Chat Completions API.
// Supports tool/function calling for structured pet behavior planning.

use anyhow::{Context, Result};
use reqwest::Client as HttpClient;
use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;

use super::config::{ai_behavior_tools, AiConfig, PlannerMode};
use super::rules::{RuleContext, RuleEvent, RulePlanner};
use crate::ai::rules::BehaviorPlan;

/// Timeout protection: spawn a tokio sleep that errors if the response takes
/// too long.  Returns `Ok(inner)` on time, `Err` on timeout.
async fn with_timeout<T>(fut: impl std::future::Future<Output = Result<T>>, ms: u64) -> Result<T> {
    tokio::select! {
        result = fut => result,
        _ = tokio::time::sleep(std::time::Duration::from_millis(ms)) => {
            anyhow::bail!("AI planner timed out after {}ms", ms);
        }
    }
}

/// Normalize a base URL: prepend `https://` if no scheme is present.
fn normalize_base_url(raw: &str) -> String {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return trimmed.to_string();
    }
    if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
        trimmed.to_string()
    } else {
        format!("https://{}", trimmed)
    }
}

// ── OpenAI API Types ────────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
struct ChatCompletionRequest {
    model: String,
    messages: Vec<Message>,
    tools: Vec<JsonValue>,
    tool_choice: String,
    temperature: f64,
    max_tokens: u32,
}

#[derive(Debug, Serialize)]
#[serde(untagged)]
enum Message {
    System { role: String, content: String },
    User { role: String, content: String },
}

#[derive(Debug, Deserialize)]
struct ChatCompletionResponse {
    choices: Vec<Choice>,
    #[allow(dead_code)]
    usage: Option<Usage>,
}

#[derive(Debug, Deserialize)]
struct Choice {
    message: ResponseMessage,
    finish_reason: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ResponseMessage {
    content: Option<String>,
    tool_calls: Option<Vec<ToolCall>>,
}

#[derive(Debug, Deserialize)]
struct ToolCall {
    id: String,
    #[serde(rename = "type")]
    call_type: String,
    function: ToolFunction,
}

#[derive(Debug, Deserialize)]
struct ToolFunction {
    name: String,
    arguments: String,
}

#[derive(Debug, Deserialize)]
struct Usage {
    #[allow(dead_code)]
    total_tokens: u32,
}

// ── Tool Call Parsing ───────────────────────────────────────────────────────

/// Parse tool call arguments JSON into a generic map.
fn parse_tool_args(raw: &str) -> JsonValue {
    serde_json::from_str(raw).unwrap_or(JsonValue::Null)
}

/// Convert tool call results into a partial BehaviorPlan.
fn plan_from_tool_calls(tool_calls: &[ToolCall], fallback: &BehaviorPlan) -> Option<BehaviorPlan> {
    if tool_calls.is_empty() {
        return None;
    }

    let mut noop = false;
    let mut noop_reason: Option<String> = None;
    let mut called_behavior = false;
    let mut pose: Option<String> = None;
    let mut playback: Option<String> = None;
    let mut intensity: Option<f64> = None;
    let mut interrupt: Option<bool> = None;
    let mut reason: Option<String> = None;
    let mut speech_text: Option<String> = None;
    let mut speech_tts: Option<bool> = None;

    for call in tool_calls {
        if call.call_type != "function" {
            continue;
        }

        let args = parse_tool_args(&call.function.arguments);
        let obj = args.as_object();

        match call.function.name.as_str() {
            "pet_noop" => {
                noop = true;
                noop_reason = obj
                    .and_then(|m| m.get("reason"))
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string());
            }
            "pet_set_action" => {
                called_behavior = true;
                if let Some(map) = obj {
                    pose = map.get("pose").and_then(|v| v.as_str()).map(String::from);
                    playback = map
                        .get("playback")
                        .and_then(|v| v.as_str())
                        .map(String::from);
                    intensity = map.get("intensity").and_then(|v| v.as_f64());
                    interrupt = map.get("interrupt").and_then(|v| v.as_bool());
                    reason = map.get("reason").and_then(|v| v.as_str()).map(String::from);
                }
            }
            "pet_say" => {
                called_behavior = true;
                if let Some(map) = obj {
                    speech_text = map.get("text").and_then(|v| v.as_str()).map(String::from);
                    speech_tts = map.get("tts").and_then(|v| v.as_bool());
                }
            }
            _ => {}
        }
    }

    // If only pet_noop was called, return a no-op plan
    if !called_behavior && noop {
        return Some(BehaviorPlan {
            should_act: Some(false),
            reason: noop_reason.or(Some("No visible change needed".into())),
            ..fallback.clone()
        });
    }

    // If no behavior tools were called at all, use fallback
    if !called_behavior {
        return None;
    }

    // Default pose to "speaking" if speech was set but no pose
    let final_pose = pose.clone().unwrap_or_else(|| {
        if speech_text.is_some() {
            "speaking".to_string()
        } else {
            fallback.pose.clone()
        }
    });

    Some(BehaviorPlan {
        pose: final_pose,
        playback: playback.unwrap_or_else(|| fallback.playback.clone()),
        should_act: Some(true),
        expression: fallback.expression.clone(),
        speech: speech_text.map(|text| crate::ai::rules::SpeechContent {
            text,
            tts: speech_tts.map(JsonValue::Bool),
        }),
        props: fallback.props.clone(),
        intensity: intensity.or(fallback.intensity),
        interrupt: interrupt.or(fallback.interrupt),
        duration_ms: fallback.duration_ms,
        reason: reason.or(fallback.reason.clone()),
    })
}

// ── System Prompt ───────────────────────────────────────────────────────────

fn build_system_prompt() -> String {
    [
        "You are ViviPet behavior agent.",
        "Use the provided tools to control the desktop pet. Do not write prose.",
        "Prefer calling tools over returning JSON text.",
        "Allowed pose values: idle, thinking, speaking, searching, reading, coding, terminal, testing, waiting_user, success, error, happy.",
        "Call pet_noop for low-value repeated events, noisy tool success, or when current pose should continue silently.",
        "Call behavior tools for errors, session end, waiting for user, visible phase changes, or useful user-facing status.",
        "Use intensity from 0 to 1. Subtle routine updates are 0.25-0.45. Errors/success can be 0.7-1.",
        "Use interrupt=false when the current ongoing pose should not be disturbed. Use interrupt=true for error/success.",
        "If speech input is provided and you act, call pet_say.",
        "Rewrite speech into a short natural Chinese character line, usually under 30 Chinese characters.",
        "Do not simply echo raw technical messages unless they already sound like character dialogue.",
        "Available semantic props: microphone, gamepad, catHands.",
    ]
    .join("\n")
}

/// Compact event data into a minimal JSON payload for the LLM.
fn compact_event(event: &RuleEvent) -> JsonValue {
    let source = event.source.as_ref().map(|s| {
        serde_json::json!({
            "agent": s.agent,
            "phase": s.phase,
            "kind": s.kind,
        })
    });

    serde_json::json!({
        "action": event.action,
        "mode": event.mode,
        "text": event.text,
        "message": event.message,
        "source": source,
    })
}

/// Compact context data for the LLM payload.
fn compact_context(context: &RuleContext) -> JsonValue {
    let recent_events: Vec<JsonValue> = context
        .recent_events
        .iter()
        .rev()
        .take(5)
        .cloned()
        .collect();

    serde_json::json!({
        "ownerAgent": context.owner_agent,
        "visiblePose": context.visible_pose,
        "activeSessionAction": context.active_session_action,
        "recentErrors": context.recent_errors.iter().rev().take(3).collect::<Vec<_>>(),
        "lastPlan": context.last_plan,
        "recentEvents": recent_events,
    })
}

/// Build the full user payload with event, context, policy, and output shape.
fn planner_payload(
    config: &AiConfig,
    event: &RuleEvent,
    context: &RuleContext,
    rule_plan: &BehaviorPlan,
) -> JsonValue {
    let input_speech = event
        .text
        .as_deref()
        .or(event.message.as_deref())
        .or(rule_plan.speech.as_ref().map(|s| s.text.as_str()));

    let mut payload = serde_json::json!({
        "event": compact_event(event),
        "context": compact_context(context),
        "speechPolicy": {
            "inputText": input_speech,
            "required": input_speech.is_some(),
            "instruction": "When inputText exists, return speech.text as a short in-character Chinese line. Do not simply copy inputText unless it is already natural character speech.",
        },
        "outputShape": {
            "shouldAct": true,
            "pose": "terminal",
            "playback": "hold",
            "intensity": 0.6,
            "interrupt": false,
            "speech": { "text": "short bubble text" },
            "reason": "short reason",
        },
    });

    // In hybrid mode, include the rule plan as reference
    if config.mode == PlannerMode::Hybrid {
        if let Ok(plan) = serde_json::to_value(rule_plan) {
            payload["rulePlan"] = plan;
        }
    }

    payload
}

fn build_messages(config: &AiConfig, event: &RuleEvent, context: &RuleContext, rule_plan: &BehaviorPlan) -> Vec<Message> {
    vec![
        Message::System {
            role: "system".into(),
            content: build_system_prompt(),
        },
        Message::User {
            role: "user".into(),
            content: planner_payload(config, event, context, rule_plan).to_string(),
        },
    ]
}

// ── OpenAI Client ───────────────────────────────────────────────────────────

/// Client for making OpenAI Chat Completions API calls.
pub struct OpenAIClient {
    http: HttpClient,
    config: AiConfig,
}

impl OpenAIClient {
    pub fn new(config: &AiConfig) -> Self {
        Self {
            http: HttpClient::new(),
            config: config.clone(),
        }
    }

    /// Call the OpenAI Chat Completions API with function calling tools.
    /// Returns the parsed BehaviorPlan from tool calls, or an error.
    pub async fn plan(
        &self,
        event: &RuleEvent,
        context: &RuleContext,
        rule_plan: &BehaviorPlan,
    ) -> Result<BehaviorPlan> {
        let base_url = normalize_base_url(&self.config.base_url);
        let url = format!("{}/chat/completions", base_url.trim_end_matches('/'));

        let tools = ai_behavior_tools();

        let request_body = ChatCompletionRequest {
            model: self.config.model.clone(),
            messages: build_messages(&self.config, event, context, rule_plan),
            tools,
            tool_choice: "auto".into(),
            temperature: 0.2,
            max_tokens: 800,
        };

        let response = with_timeout(
            async {
                self.http
                    .post(&url)
                    .header("Authorization", format!("Bearer {}", self.config.api_key))
                    .header("Content-Type", "application/json")
                    .json(&request_body)
                    .send()
                    .await
                    .map_err(|e| anyhow::anyhow!("Reqwest error: {e}"))
            },
            self.config.timeout_ms,
        )
        .await
        .context("Failed to send OpenAI request")?
        .error_for_status()
        .map_err(|e| anyhow::anyhow!("OpenAI API returned error status: {e}"))?;

        let completion: ChatCompletionResponse = response
            .json()
            .await
            .context("Failed to parse OpenAI response")?;

        let choice = completion
            .choices
            .into_iter()
            .next()
            .context("OpenAI returned no choices")?;

        // Try tool calls first
        if let Some(tool_calls) = choice.message.tool_calls {
            if let Some(plan) = plan_from_tool_calls(&tool_calls, rule_plan) {
                return Ok(plan);
            }
        }

        // Fall back to content parsing if no tool calls
        if let Some(content) = choice.message.content {
            if let Ok(parsed) = serde_json::from_str::<BehaviorPlan>(&content) {
                return Ok(parsed);
            }
            // Try to extract JSON from markdown code block
            if let Some(json_start) = content.find('{') {
                if let Some(json_end) = content.rfind('}') {
                    let json_str = &content[json_start..=json_end];
                    if let Ok(parsed) = serde_json::from_str::<BehaviorPlan>(json_str) {
                        return Ok(parsed);
                    }
                }
            }
        }

        anyhow::bail!("OpenAI response did not contain a valid plan");
    }
}

// ── AI Planner ──────────────────────────────────────────────────────────────

/// High-level AI planner that dispatches to the OpenAI client or rule planner
/// based on the configured mode.
#[derive(Clone)]
pub struct AiPlanner {
    pub config: AiConfig,
    rule_planner: RulePlanner,
}

impl AiPlanner {
    pub fn new(config: AiConfig) -> Self {
        Self {
            config,
            rule_planner: RulePlanner,
        }
    }

    pub fn update_config(&mut self, config: AiConfig) {
        self.config = config;
    }

    /// Plan a behavior based on the event and context.
    /// Dispatches to rule, AI, or hybrid planner based on the current config.
    pub async fn plan(
        &self,
        event: &RuleEvent,
        context: &RuleContext,
    ) -> Result<BehaviorPlan> {
        // Always compute the rule plan first (needed for hybrid mode and as final fallback)
        let rule_plan = self.rule_planner.plan(event, context);

        match self.config.mode {
            PlannerMode::Rule => Ok(rule_plan),

            PlannerMode::Ai => {
                if !self.config.enabled || self.config.api_key.is_empty() {
                    anyhow::bail!("AI planner is disabled or API key is missing");
                }

                let client = OpenAIClient::new(&self.config);
                match client.plan(event, context, &rule_plan).await {
                    Ok(plan) => Ok(plan),
                    Err(e) => {
                        tracing::warn!("[AiPlanner] AI mode failed: {:#}", e);
                        if self.config.fallback_to_rule {
                            tracing::info!("[AiPlanner] Falling back to rule plan");
                            Ok(rule_plan)
                        } else {
                            Err(e)
                        }
                    }
                }
            }

            PlannerMode::Hybrid => {
                // AI with rule fallback
                if self.config.enabled && !self.config.api_key.is_empty() {
                    let client = OpenAIClient::new(&self.config);
                    match client.plan(event, context, &rule_plan).await {
                        Ok(plan) => return Ok(plan),
                        Err(e) => {
                            tracing::warn!("[AiPlanner] Hybrid mode AI call failed: {:#}", e);
                        }
                    }
                }
                Ok(rule_plan)
            }
        }
    }

    /// Test the OpenAI connection without making a full plan.
    pub async fn test_connection(&self, partial: Option<AiConfig>) -> Result<()> {
        let config = partial.unwrap_or_else(|| self.config.clone());

        if config.api_key.trim().is_empty() {
            anyhow::bail!("API key is required");
        }
        if config.model.trim().is_empty() {
            anyhow::bail!("Model is required");
        }

        let test_event = RuleEvent {
            action: Some("terminal".into()),
            mode: Some("continuous".into()),
            text: None,
            message: None,
            source: Some(super::rules::EventSource {
                agent: None,
                phase: Some("tool:start".into()),
                kind: Some("bash".into()),
            }),
            tts: None,
            reset_after_ms: None,
        };

        let test_context = RuleContext {
            owner_agent: None,
            visible_pose: Some("terminal".into()),
            active_session_action: None,
            recent_errors: vec![],
            last_plan: None,
            recent_events: vec![],
        };

        let rule_plan = self.rule_planner.plan(&test_event, &test_context);
        let client = OpenAIClient::new(&config);

        client.plan(&test_event, &test_context, &rule_plan).await?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_normalize_base_url() {
        assert_eq!(
            normalize_base_url("https://api.openai.com/v1"),
            "https://api.openai.com/v1"
        );
        assert_eq!(
            normalize_base_url("api.openai.com/v1"),
            "https://api.openai.com/v1"
        );
        assert_eq!(
            normalize_base_url("http://localhost:8080/v1"),
            "http://localhost:8080/v1"
        );
        assert_eq!(normalize_base_url(""), "");
    }

    #[test]
    fn test_plan_from_tool_calls_noop_only() {
        let tool_calls = vec![ToolCall {
            id: "1".into(),
            call_type: "function".into(),
            function: ToolFunction {
                name: "pet_noop".into(),
                arguments: r#"{"reason": "Low-value event"}"#.into(),
            },
        }];

        let fallback = BehaviorPlan::idle();
        let plan = plan_from_tool_calls(&tool_calls, &fallback);

        assert!(plan.is_some());
        let plan = plan.unwrap();
        assert_eq!(plan.should_act, Some(false));
        assert_eq!(plan.reason, Some("Low-value event".into()));
    }

    #[test]
    fn test_plan_from_tool_calls_set_action() {
        let tool_calls = vec![ToolCall {
            id: "2".into(),
            call_type: "function".into(),
            function: ToolFunction {
                name: "pet_set_action".into(),
                arguments: r#"{"pose": "thinking", "playback": "hold", "intensity": 0.5, "interrupt": false}"#.into(),
            },
        }];

        let fallback = BehaviorPlan::idle();
        let plan = plan_from_tool_calls(&tool_calls, &fallback);

        assert!(plan.is_some());
        let plan = plan.unwrap();
        assert_eq!(plan.pose, "thinking");
        assert_eq!(plan.playback, "hold");
        assert_eq!(plan.intensity, Some(0.5));
        assert_eq!(plan.interrupt, Some(false));
        assert_eq!(plan.should_act, Some(true));
    }

    #[test]
    fn test_plan_from_tool_calls_say_with_pose_fallback() {
        let tool_calls = vec![ToolCall {
            id: "3".into(),
            call_type: "function".into(),
            function: ToolFunction {
                name: "pet_say".into(),
                arguments: r#"{"text": "你好世界", "tts": true}"#.into(),
            },
        }];

        let fallback = BehaviorPlan::idle();
        let plan = plan_from_tool_calls(&tool_calls, &fallback);

        assert!(plan.is_some());
        let plan = plan.unwrap();
        assert_eq!(plan.pose, "speaking");
        assert!(plan.speech.is_some());
        let speech = plan.speech.unwrap();
        assert_eq!(speech.text, "你好世界");
        assert_eq!(speech.tts, Some(JsonValue::Bool(true)));
    }
}
