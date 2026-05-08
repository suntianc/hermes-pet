# Phase 2: Animation/Event Integration - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-08
**Phase:** 2-Animation/Event Integration
**Areas discussed:** idle auto-return, lip sync, mouse smoothing, action interruption, SM naming, testing

---

## Gray Areas (Agent Decision — User Delegated All)

All 5 gray areas were presented to the user. The user selected "全部由你来决策" (agent decides all).

---

## Idle Auto Return

| Option | Description | Selected |
|--------|-------------|----------|
| TypeScript timer + state reset | Existing scheduleIdle() pattern | ✓ |
| Rive SM built-in transitions | Rely on .riv file transition timing | |
| Hybrid | Both mechanisms | ✓ (primary) |

**Notes:** Hybrid with RiveRenderer-internal timer for momentary actions + external scheduleIdle for continuous actions.

---

## Lip Sync Implementation

| Option | Description | Selected |
|--------|-------------|----------|
| PetStore polling via useEffect | Existing ttsAmplitude pipeline | ✓ |
| Direct StreamingAudioPlayer callback | Bypass PetStore | |

**Notes:** Leverage existing PetStore → PetStage → RiveRenderer.setSpeaking() chain. Add amplitude clamping at 0.05 threshold.

---

## Mouse Follow Smoothing

| Option | Description | Selected |
|--------|-------------|----------|
| Lerp in RiveRenderer | Smooth in update loop | ✓ |
| Raw pass-through | PetStage → SM direct | |

**Notes:** Lerp with factor 0.1 at rAF frequency. Coordinate normalization to -1.0~1.0 in RiveRenderer.

---

## Action Interruption

| Option | Description | Selected |
|--------|-------------|----------|
| Immediate interrupt | Override state input directly | ✓ |
| Queue next action | Wait for current to complete | |

**Notes:** Immediate override matches existing event system behavior. No queue needed.

---

## the agent's Discretion

- Lerp factor (default 0.1) — tunable during implementation
- Clamp threshold (default 0.05) — tunable based on audio characteristics
- Idle return delay (default 300-500ms) — per existing scheduleIdle values
- Input query caching optimization — if performance requires it

## Deferred Ideas

None — all discussion stayed within Phase 2 scope.
