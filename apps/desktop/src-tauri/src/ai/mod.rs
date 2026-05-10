// ── AI Planner Module ───────────────────────────────────────────────────────
//
// Phase 5: OpenAI-driven pet behavior planning with three operational modes
// (rule / ai / hybrid), all implemented in Rust.
//
// Module structure:
//   config.rs  — AiConfig, PlannerMode, tool definitions
//   rules.rs   — Rule-based deterministic planner, BehaviorPlan types
//   openai.rs  — Reqwest OpenAI client, AiPlanner dispatcher

pub mod config;
pub mod openai;
pub mod rules;

// Re-exports for convenience
pub use config::AiConfig;
pub use openai::AiPlanner;
pub use rules::{BehaviorPlan, RuleContext, RuleEvent};
