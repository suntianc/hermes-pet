---
phase: 3
slug: live2d-cleanup
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-05-08
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | TypeScript compilation + grep audit + dev server smoke test |
| **Config file** | none — no unit test infrastructure needed for cleanup phase |
| **Quick run command** | `npm run build` (TypeScript compilation check) |
| **Full suite command** | `npm run build && grep audit` |
| **Estimated runtime** | ~30 seconds (build only) |

---

## Sampling Rate

- **After every task commit:** Run `npm run build` — TypeScript compilation must pass
- **After every plan wave:** Full grep audit (`live2d|cubism|\.moc3|\.model3|live2dcubism|@framework`) + `npm run build`
- **Before `/gsd-verify-work`:** Full grep audit + `npm run build` + `npm run dev:renderer` smoke test
- **Max feedback latency:** Immediate (TypeScript) / ~30s (build + grep)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 3-01-01 | 01 | 1 | CLEAN-01, CLEAN-02 | — | N/A (file deletion) | ls check | `ls` on deleted paths returns "No such file" | ❌ | ⬜ pending |
| 3-01-02 | 01 | 1 | CLEAN-03, CLEAN-04, D-16 | — | N/A (file deletion) | ls check | `ls` on deleted paths returns "No such file" | ❌ | ⬜ pending |
| 3-02-01 | 02 | 2 | CLEAN-05 | — | N/A (config cleanup) | grep+tsc | `npm run build` | ❌ | ⬜ pending |
| 3-02-02 | 02 | 2 | CLEAN-05 | — | N/A (type cleanup) | grep+tsc | `npm run build` | ❌ | ⬜ pending |
| 3-02-03 | 02 | 2 | CLEAN-06 | — | N/A (source cleanup) | grep+tsc | `npm run build` | ❌ | ⬜ pending |
| 3-03-01 | 03 | 2 | D-15 | — | N/A (source cleanup) | grep+tsc | `npm run build` | ❌ | ⬜ pending |
| 3-03-02 | 03 | 2 | D-17, D-18 | — | N/A (data file + main process cleanup) | grep+tsc | `npm run build` | ❌ | ⬜ pending |
| 3-03-03 | 03 | 2 | CLEAN-07, D-19 | — | N/A (dep removal) | grep+tsc | `npm run build` | ❌ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. TypeScript compilation (`npm run build`) + grep audit is the complete automated verification. No Wave 0 test scaffolding needed — this is a file deletion + reference cleanup phase.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Application starts without Live2D errors | CLEAN-01~07 | UI/app behavior is visual | `npm run dev:renderer`, open browser console, confirm no Live2D/Cubism/Core loading errors |
| Rive rendering still works | Regression | Visual confirmation | Verify PetStage Rive canvas renders correctly, no regression from deleted Live2D code |
| Tray menu operation | Regression | UI interaction | Right-click tray icon, verify menu items (Show/Hide, Always on Top, etc.) still work |

---

## Verification Commands

### After Each Task: Quick Build Check
```bash
npm run build:renderer
```

### After Each Plan: Full Build
```bash
npm run build
```

### Grep Audit (D-21)
```bash
# Zero Live2D references in source code
grep -rn "live2d\|cubism\|\.moc3\|\.model3\|live2dcubism\|@framework" \
  --include="*.{ts,tsx,mts}" apps/desktop/src apps/desktop/electron \
  apps/desktop/vite.config.mts apps/desktop/tsconfig.json | wc -l
# Expected: 0

# Zero gsap/extract-zip in source code (after 03-03)
grep -rn "from 'gsap'\|extract-zip\|extractZip" \
  --include="*.{ts,tsx}" apps/desktop/src apps/desktop/electron | wc -l
# Expected: 0
```

### Dev Server Smoke Test (D-22)
```bash
npm run dev:renderer &
sleep 5 && kill %1
# Verify: no error exit code, Vite dev server started on :5173
```

---

## Validation Sign-Off

- [x] All tasks have build checks or grep verification
- [x] Sampling continuity: build check after every commit
- [x] Wave 0 covers all MISSING references (none needed — cleanup phase)
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter
- [x] Grep audit included in every plan-level verification

**Approval:** pending
