# Phase 5: AI Planner — Context

**Gathered:** 2026-05-10
**Status:** Ready for planning
**Mode:** Agent discretion

<domain>
## Phase Boundary

Rust AI 行为规划器：OpenAI function calling via reqwest，三模式 (rule/ai/hybrid)。

**Requirements:** AI-01 (OpenAI client), AI-02 (three modes + config persistence)

</domain>

<decisions>
## Implementation Decisions

### the agent's Discretion
- OpenAI API via reqwest (non-streaming, function calling)
- Three modes: rule (deterministic), ai (LLM-driven), hybrid (ai + rule override)
- Config persistence via tauri-plugin-store
- Function definitions: pet_noop, pet_set_action, pet_say
- Tool calling integration with action DSL types from @hermes/pet-action-dsl
- Mode switching via frontend command

</decisions>

<canonical_refs>
- `.planning/REQUIREMENTS.md` — AI-01, AI-02
- `.planning/ROADMAP.md` §Phase 5 — Success criteria
- `apps/desktop/electron/ai-planner.ts` — Current implementation (reference)
- `apps/desktop/src/features/pet-events/behavior-planner.ts` — Frontend planner
</canonical_refs>

---

*Phase: 5-AI-Planner*
*Context gathered: 2026-05-10*
