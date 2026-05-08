---
phase: 2
slug: animation-event-integration
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-08
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Manual verification (visual/behavioral) |
| **Config file** | none — no automated test infrastructure for animation behavior |
| **Quick run command** | `npm run dev:renderer` (visual verification) |
| **Full suite command** | `npm run build` (TypeScript compilation check) |
| **Estimated runtime** | ~30 seconds (build only) |

---

## Sampling Rate

- **After every task commit:** Run `npm run build` — TypeScript compilation must pass
- **After every plan wave:** Manual visual verification in dev server
- **Before `/gsd-verify-work`:** Full manual UAT: test all 5 SYNC requirements
- **Max feedback latency:** Immediate (TypeScript) / manual (visual)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 2-01-01 | 01 | 1 | SYNC-01 | — | N/A (animation only) | grep+tsc | `npm run build` | ❌ | ⬜ pending |
| 2-01-02 | 01 | 1 | SYNC-01, SYNC-04, SYNC-05 | — | N/A | grep+tsc | `npm run build` | ❌ | ⬜ pending |
| 2-01-03 | 01 | 1 | D-17 | — | N/A | grep+tsc | `npm run build` | ❌ | ⬜ pending |
| 2-02-01 | 02 | 2 | SYNC-02 | — | N/A | grep+tsc | `npm run build` | ❌ | ⬜ pending |
| 2-02-02 | 02 | 2 | SYNC-03 | — | N/A | grep+tsc | `npm run build` | ❌ | ⬜ pending |
| 2-02-03 | 02 | 2 | SYNC-02, SYNC-03 | — | N/A | grep+tsc | `npm run build` | ❌ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. TypeScript compilation (`npm run build`) is the only automated check needed.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| SM state mapping | SYNC-01 | Animation behavior is visual | Trigger events via Adapter API (`curl POST /adapter`), observe SM state transitions |
| Lip sync amplitude | SYNC-02 | RMS-to-mouth animation is real-time visual | Enable TTS, speak text, observe mouth_open animation |
| Mouse follow smoothing | SYNC-03 | Eye tracking is visual | Move cursor over pet, observe look_x/look_y animation smoothness |
| Idle auto-return | SYNC-04 | Timing-dependent animation | Trigger momentary action (happy/error), verify auto-return to idle after expected duration |
| Action interrupt | SYNC-05 | Interrupt timing is visual | Trigger quick consecutive actions, verify immediate transition |

---

## Validation Sign-Off

- [ ] All tasks have manual verification or build checks
- [ ] Sampling continuity: build check after every commit
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
