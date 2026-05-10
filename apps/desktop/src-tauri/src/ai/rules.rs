// ── Rule-Based Behavior Planner ─────────────────────────────────────────────
//
// Deterministic rule-planning engine used in two scenarios:
// 1. `rule` mode — pure local planning, no network calls
// 2. `hybrid` fallback — when the LLM call fails or times out
//
// Mirrors the logic from the frontend's composeBehaviorPlan() so that the
// same deterministic rules apply regardless of whether the LLM is active.

use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;

// ── Input Types ─────────────────────────────────────────────────────────────

/// Summary of the event source, matching the frontend PetStateEvent.source.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EventSource {
    pub agent: Option<String>,
    pub phase: Option<String>,
    pub kind: Option<String>,
}

/// The event that triggered the planning request.
/// Mirrors the essential fields from the frontend's PetStateEvent.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RuleEvent {
    pub action: Option<String>,
    pub mode: Option<String>, // "momentary" or "continuous"
    pub text: Option<String>,
    pub message: Option<String>,
    pub source: Option<EventSource>,
    pub tts: Option<bool>,
    pub reset_after_ms: Option<u64>,
}

impl RuleEvent {
    /// Extract the primary text payload from the event.
    fn speech_text(&self) -> Option<&str> {
        self.text
            .as_deref()
            .or_else(|| self.message.as_deref())
            .filter(|s| !s.is_empty())
    }

    /// Extract the source phase.
    fn phase(&self) -> Option<&str> {
        self.source.as_ref().and_then(|s| s.phase.as_deref())
    }

    /// Extract the source kind.
    fn kind(&self) -> Option<&str> {
        self.source.as_ref().and_then(|s| s.kind.as_deref())
    }

    fn is_momentary(&self) -> bool {
        self.mode.as_deref() == Some("momentary")
    }
}

/// Contextual information for planning decisions.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RuleContext {
    pub owner_agent: Option<String>,
    pub visible_pose: Option<String>,
    pub active_session_action: Option<String>,
    #[serde(default)]
    pub recent_errors: Vec<String>,
    pub last_plan: Option<JsonValue>,
    #[serde(default)]
    pub recent_events: Vec<JsonValue>,
}

// ── Output Types ────────────────────────────────────────────────────────────

/// A piece of speech content in the plan.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpeechContent {
    pub text: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tts: Option<JsonValue>, // bool or PetTTSOptions object
}

/// A semantic prop item.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PropItem {
    pub name: String,
    pub enabled: bool,
}

/// The structured plan returned to the frontend.
/// Mirrors the frontend's BehaviorPlan interface (camelCase serialization).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BehaviorPlan {
    /// Primary pose value.
    pub pose: String,
    /// How the pose plays: "hold" (stays) or "momentary" (plays once).
    pub playback: String,
    /// Whether the pet should visibly act on this plan.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub should_act: Option<bool>,
    /// Optional facial expression override.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expression: Option<String>,
    /// Optional speech bubble content.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub speech: Option<SpeechContent>,
    /// Optional semantic props.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub props: Option<Vec<PropItem>>,
    /// Animation intensity (0.0–1.0).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub intensity: Option<f64>,
    /// Whether this plan should interrupt the current animation.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub interrupt: Option<bool>,
    /// Duration in milliseconds before auto-reset.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub duration_ms: Option<u64>,
    /// Human-readable reason for this plan.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
}

impl Default for BehaviorPlan {
    fn default() -> Self {
        Self {
            pose: "idle".into(),
            playback: "hold".into(),
            should_act: Some(true),
            expression: None,
            speech: None,
            props: None,
            intensity: None,
            interrupt: None,
            duration_ms: None,
            reason: None,
        }
    }
}

impl BehaviorPlan {
    /// Create a fallback idle plan.
    pub fn idle() -> Self {
        Self::default()
    }

    /// Create a runtime-sustained plan for the given visible pose.
    pub fn runtime(visible_pose: &str) -> Self {
        Self {
            pose: visible_pose.to_string(),
            playback: "hold".into(),
            should_act: Some(true),
            intensity: Some(0.45),
            interrupt: Some(false),
            expression: if visible_pose == "idle" {
                Some("neutral".into())
            } else {
                None
            },
            ..Default::default()
        }
    }
}

// ── Rule Logic ──────────────────────────────────────────────────────────────

/// Derive the appropriate expression for an event + pose combination.
fn expression_for_event(event: &RuleEvent, pose: &str) -> Option<String> {
    let phase = event.phase();
    let kind = event.kind().map(|k| k.to_lowercase());

    match pose {
        "error" | "searching" => return Some("worried".into()),
        "success" | "happy" => {
            if let Some(ph) = phase {
                if ph == "task:done" || ph == "session:end" {
                    return Some("happy".into());
                }
            }
        }
        "terminal" | "coding" | "reading" | "testing" => return Some("focused".into()),
        "waiting_user" => return Some("confused".into()),
        "speaking" | "thinking" => {}
        _ => {}
    }

    // Phase-based heuristics
    if let Some(ph) = phase {
        return match ph {
            "tool:error" => Some("worried".into()),
            "task:done" | "session:end" => Some("happy".into()),
            "tool:start" | "session:start" => Some("focused".into()),
            "message" => Some("neutral".into()),
            _ => None,
        };
    }

    if let Some(k) = kind {
        if k == "bash" || k == "shell" || k == "zsh" || k == "terminal" {
            return Some("focused".into());
        }
    }

    None
}

/// Derive the appropriate semantic props for an event + pose combination.
fn props_for_event(event: &RuleEvent, pose: &str) -> Option<Vec<PropItem>> {
    let phase = event.phase();

    if pose == "speaking"
        || phase == Some("message")
        || phase == Some("session:start")
        || phase == Some("session:update")
    {
        return Some(vec![PropItem {
            name: "microphone".into(),
            enabled: true,
        }]);
    }

    None
}

/// Compose a full behavior plan from an event and the current visible pose.
/// Mirrors the frontend `composeBehaviorPlan()` function.
pub fn compose_behavior_plan(event: &RuleEvent, visible_pose: &str) -> BehaviorPlan {
    let text = event.speech_text().map(|s| SpeechContent {
        text: s.to_string(),
        tts: event.tts.map(JsonValue::Bool),
    });

    let pose = if event.is_momentary() {
        event
            .action
            .as_deref()
            .unwrap_or(visible_pose)
            .to_string()
    } else {
        visible_pose.to_string()
    };

    let playback = if event.is_momentary() {
        "momentary"
    } else {
        "hold"
    };

    let expression = expression_for_event(event, &pose);
    let props = props_for_event(event, &pose);

    BehaviorPlan {
        pose,
        playback: playback.into(),
        should_act: Some(true),
        expression,
        props,
        intensity: Some(if event.is_momentary() { 0.75 } else { 0.55 }),
        interrupt: Some(event.is_momentary()),
        duration_ms: event.reset_after_ms,
        speech: text,
        ..Default::default()
    }
}

// ── Rule Planner ────────────────────────────────────────────────────────────

/// The rule-based behavior planner.
/// Used directly in `rule` mode and as fallback in `hybrid` mode.
#[derive(Clone)]
pub struct RulePlanner;

impl RulePlanner {
    /// Plan a behavior based on the event and context, using only deterministic rules.
    pub fn plan(&self, event: &RuleEvent, context: &RuleContext) -> BehaviorPlan {
        let visible_pose = context
            .visible_pose
            .as_deref()
            .unwrap_or("idle");

        compose_behavior_plan(event, visible_pose)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_idle_event_returns_idle_plan() {
        let event = RuleEvent {
            action: Some("idle".into()),
            mode: Some("continuous".into()),
            text: None,
            message: None,
            source: None,
            tts: None,
            reset_after_ms: None,
        };
        let context = RuleContext {
            owner_agent: None,
            visible_pose: Some("idle".into()),
            active_session_action: None,
            recent_errors: vec![],
            last_plan: None,
            recent_events: vec![],
        };
        let planner = RulePlanner;
        let plan = planner.plan(&event, &context);

        assert_eq!(plan.pose, "idle");
        assert_eq!(plan.playback, "hold");
        assert_eq!(plan.should_act, Some(true));
        assert_eq!(plan.expression, None); // no phase/kind info
    }

    #[test]
    fn test_error_event_gets_worried_expression() {
        let event = RuleEvent {
            action: Some("error".into()),
            mode: Some("momentary".into()),
            text: Some("Something went wrong".into()),
            message: None,
            source: Some(EventSource {
                agent: Some("agent".into()),
                phase: Some("tool:error".into()),
                kind: Some("bash".into()),
            }),
            tts: Some(false),
            reset_after_ms: Some(3000),
        };
        let context = RuleContext {
            owner_agent: None,
            visible_pose: Some("idle".into()),
            active_session_action: None,
            recent_errors: vec!["prev error".into()],
            last_plan: None,
            recent_events: vec![],
        };
        let planner = RulePlanner;
        let plan = planner.plan(&event, &context);

        assert_eq!(plan.pose, "error");
        assert_eq!(plan.playback, "momentary");
        assert_eq!(plan.expression, Some("worried".into()));
        assert_eq!(plan.interrupt, Some(true));
        assert!(plan.speech.is_some());
        assert_eq!(plan.speech.as_ref().unwrap().text, "Something went wrong");
    }

    #[test]
    fn test_terminal_event_gets_focused_expression() {
        // In continuous mode, pose = visible_pose ("terminal").
        // The expression is derived from the event's phase/kind.
        let event = RuleEvent {
            action: Some("terminal".into()),
            mode: Some("continuous".into()),
            text: None,
            message: None,
            source: Some(EventSource {
                agent: None,
                phase: Some("tool:start".into()),
                kind: Some("bash".into()),
            }),
            tts: None,
            reset_after_ms: None,
        };
        let context = RuleContext {
            owner_agent: None,
            visible_pose: Some("terminal".into()),
            active_session_action: None,
            recent_errors: vec![],
            last_plan: None,
            recent_events: vec![],
        };
        let planner = RulePlanner;
        let plan = planner.plan(&event, &context);

        assert_eq!(plan.pose, "terminal");
        assert_eq!(plan.expression, Some("focused".into()));
    }

    #[test]
    fn test_momentary_event_uses_action_as_pose() {
        // In momentary mode, pose = event.action, not visible_pose
        let event = RuleEvent {
            action: Some("thinking".into()),
            mode: Some("momentary".into()),
            text: None,
            message: None,
            source: None,
            tts: None,
            reset_after_ms: None,
        };
        let context = RuleContext {
            owner_agent: None,
            visible_pose: Some("idle".into()),
            active_session_action: None,
            recent_errors: vec![],
            last_plan: None,
            recent_events: vec![],
        };
        let planner = RulePlanner;
        let plan = planner.plan(&event, &context);

        assert_eq!(plan.pose, "thinking");
        assert_eq!(plan.playback, "momentary");
        assert_eq!(plan.interrupt, Some(true));
    }

    #[test]
    fn test_speech_text_extracted_from_text_or_message() {
        let event = RuleEvent {
            action: Some("speaking".into()),
            mode: Some("continuous".into()),
            text: Some("Hello!".into()),
            message: Some("Fallback".into()),
            source: Some(EventSource {
                agent: None,
                phase: Some("message".into()),
                kind: None,
            }),
            tts: Some(true),
            reset_after_ms: None,
        };
        let context = RuleContext {
            owner_agent: None,
            visible_pose: Some("idle".into()),
            active_session_action: None,
            recent_errors: vec![],
            last_plan: None,
            recent_events: vec![],
        };
        let planner = RulePlanner;
        let plan = planner.plan(&event, &context);

        assert_eq!(plan.pose, "idle"); // continuous mode uses visible_pose
        assert_eq!(plan.playback, "hold");
        assert!(plan.speech.is_some());
        assert_eq!(plan.speech.as_ref().unwrap().text, "Hello!");
        assert_eq!(plan.speech.as_ref().unwrap().tts, Some(JsonValue::Bool(true)));
    }
}
