---
phase: 4
slug: model-system-adaptation
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-05-08
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | TypeScript compilation (npm run build) |
| **Config file** | none |
| **Quick run command** | `npm run build` |
| **Full suite command** | `npm run build` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm run build`
- **After every plan wave:** Run `npm run build` + grep audit
- **Before `/gsd-verify-work`:** Full build must be green
- **Max feedback latency:** ~30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 4-01-01 | 01 | 1 | MODEL-03 | — | N/A | build | `npm run build` | ❌ | ⬜ pending |
| 4-01-02 | 01 | 1 | MODEL-03 | — | N/A | build | `npm run build` | ❌ | ⬜ pending |
| 4-01-03 | 01 | 1 | MODEL-02 | — | N/A | build | `npm run build` | ❌ | ⬜ pending |
| 4-02-01 | 02 | 2 | MODEL-04 | — | N/A | build | `npm run build` | ❌ | ⬜ pending |
| 4-02-02 | 02 | 2 | MODEL-05 | — | N/A | file-exists | `test -f RIVE_MODEL_INTEGRATION.md` | ❌ | ⬜ pending |
| 4-02-03 | 02 | 2 | — | — | N/A | build+grep | `npm run build && grep` | ❌ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| File dialog opens for .riv files | MODEL-03 | Requires user interaction | Click "Import Model" in tray, verify dialog filter shows .riv |
| .riv model appears after import | MODEL-03 | Requires imported .riv file | Import a .riv file, verify model loads in PetStage |
| vivipet-assets protocol serves files | MODEL-04 | Requires user-imported model | Check network tab for vivipet-assets:// fetch |

---

## Validation Sign-Off

- [ ] All tasks have build verification or Wave 0 dependencies
- [ ] Sampling continuity: build check after every commit
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
