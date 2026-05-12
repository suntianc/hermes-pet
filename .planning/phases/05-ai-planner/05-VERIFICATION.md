# Phase 5: AI Planner — VERIFICATION

**Status:** ✅ Complete
**Date:** 2026-05-10
**Commit:** `f77b54f`

## Files Created

| File | Purpose |
|------|---------|
| `src-tauri/src/ai/mod.rs` | Module root, re-exports `AiConfig`, `AiPlanner`, `BehaviorPlan`, `RuleEvent`, `RuleContext` |
| `src-tauri/src/ai/config.rs` | `AiConfig`, `PlannerMode` enum (Rule/Ai/Hybrid), tool definitions for OpenAI function calling |
| `src-tauri/src/ai/rules.rs` | `RulePlanner` — deterministic behavior planner, `BehaviorPlan` output type, `RuleEvent`/`RuleContext` input types, `compose_behavior_plan()` matching frontend logic |
| `src-tauri/src/ai/openai.rs` | `OpenAIClient` — reqwest POST to `/v1/chat/completions`, tool call parsing, `AiPlanner` — dispatcher for rule/ai/hybrid modes with timeouts and fallback logic |
| `src-tauri/src/commands/ai.rs` | Tauri commands: `ai_plan`, `ai_get_config`, `ai_set_config`, `ai_test_connection` |

## Files Modified

| File | Change |
|------|--------|
| `src-tauri/src/commands/mod.rs` | Added `pub mod ai;` |
| `src-tauri/src/state.rs` | Added `ai_planner: AiPlanner` and `ai_config: AiConfig` to `AppState` |
| `src-tauri/src/error.rs` | Added `Ai(String)` variant |
| `src-tauri/src/lib.rs` | Added `mod ai;`, 4 command handlers, `load_ai_config()` function, AI config loading in `setup()` |

## Requirements Satisfied

- **AI-01**: reqwest 调用 OpenAI Chat Completions API，function calling 支持 ✅
  - `OpenAIClient` in `openai.rs` sends POST to `/v1/chat/completions` with tools array
  - Tool definitions: `pet_noop`, `pet_set_action`, `pet_say`
  - Parses tool call arguments into structured `BehaviorPlan`
  - Timeout protection via `tokio::select!`
  - Error handling with fallback support

- **AI-02**: 三模式运行：rule / ai / hybrid，配置持久化 ✅
  - `PlannerMode` enum: Rule, Ai, Hybrid
  - `AiPlanner::plan()` dispatches based on configured mode:
    - Rule: pure deterministic planning, no network calls
    - Ai: OpenAI LLM only, with optional fallback to rule
    - Hybrid: tries LLM first, falls back to rule on failure
  - Config persisted via `tauri-plugin-store` (`ai_config` key in `settings.json`)
  - Config loaded on startup in `load_ai_config()`

## Test Results (9/9 passing)

```
test ai::openai::tests::test_normalize_base_url ... ok
test ai::openai::tests::test_plan_from_tool_calls_noop_only ... ok
test ai::openai::tests::test_plan_from_tool_calls_set_action ... ok
test ai::openai::tests::test_plan_from_tool_calls_say_with_pose_fallback ... ok
test ai::rules::tests::test_idle_event_returns_idle_plan ... ok
test ai::rules::tests::test_error_event_gets_worried_expression ... ok
test ai::rules::tests::test_terminal_event_gets_focused_expression ... ok
test ai::rules::tests::test_momentary_event_uses_action_as_pose ... ok
test ai::rules::tests::test_speech_text_extracted_from_text_or_message ... ok
```

## Verification Checklist

- [x] Build succeeds (`cargo build` — no errors)
- [x] All tests pass (`cargo test --lib ai::` — 9/9)
- [x] AI module integrated into lib.rs with proper module declaration
- [x] Commands registered in invoke_handler
- [x] Config loaded on app startup from tauri-plugin-store
- [x] Config persisted on set via tauri-plugin-store
- [x] Rule planner mirrors frontend `composeBehaviorPlan()` logic
- [x] OpenAI client supports function calling (pet_noop, pet_set_action, pet_say)
- [x] Three modes (rule/ai/hybrid) with correct dispatch logic
- [x] AI mode error handling with optional rule fallback
- [x] API key, base URL, model, timeout all configurable

## Frontend Integration (Phase 6)

The frontend will invoke these Tauri commands:
```typescript
import { invoke } from '@tauri-apps/api/core';

// Plan a behavior
const result = await invoke('ai_plan', {
  request: {
    event: { action, mode, text, message, source },
    context: { visiblePose, recentEvents, recentErrors, lastPlan },
  },
});
// Returns { ok, plan: BehaviorPlan, mode: string, error?: string }

// Get config
const config = await invoke('ai_get_config');
// Returns { enabled, mode, baseUrl, apiKey, model, timeoutMs, fallbackToRule }

// Set config
await invoke('ai_set_config', { config });
```
