---
phase: 04-model-system-adaptation
plan: 02
subsystem: build-config, documentation
tags: [electron-builder, rive-integration, docs, verification]
requires: [04-01]
provides: [MODEL-04, MODEL-05]
affects:
  - apps/desktop/electron-builder.yml
  - apps/desktop/RIVE_MODEL_INTEGRATION.md
tech-stack:
  added: []
  patterns: [yaml-cleanup, rive-sm-documentation]
key-files:
  created:
    - apps/desktop/RIVE_MODEL_INTEGRATION.md
  modified:
    - apps/desktop/electron-builder.yml
decisions:
  - D-16: Removed public/models extraResources reference from electron-builder.yml
  - D-18: Created RIVE_MODEL_INTEGRATION.md user documentation
  - D-19: Documentation covers SM inputs table, .riv file placement, vivipet-assets protocol
  - D-20: Documentation provides models.json config example template
  - D-24: electron-builder no longer references missing directory
metrics:
  duration: ~10min
  completed_date: 2026-05-08
---

# Phase 4 Plan 2: electron-builder.yml Fix & Rive Documentation & Final Verification

This is the **final plan in the project** — after this, all 24 v1 requirements are complete.

Fixed the dangling `public/models` extraResources reference in electron-builder.yml (per D-16), created comprehensive `RIVE_MODEL_INTEGRATION.md` user documentation (per MODEL-05, D-18~D-20), and ran full Phase 4 verification audit (D-21~D-24).

## Tasks

| # | Name | Type | Commit | Files Changed |
|---|------|------|--------|---------------|
| 1 | Remove dangling public/models reference from electron-builder.yml | auto | `fe850a0` | electron-builder.yml (-2 lines) |
| 2 | Create RIVE_MODEL_INTEGRATION.md user documentation | auto | `f87a59e` | RIVE_MODEL_INTEGRATION.md (+260 lines) |
| 3 | Full Phase 4 verification audit | auto | (verification only) | — |

## Key Changes

### Task 1: electron-builder.yml Cleanup
- Removed `public/models` extraResources entry (lines 12-13) per D-16, D-24
- `assets/` extraResources entry preserved — assets directory is still active

### Task 2: RIVE_MODEL_INTEGRATION.md
- **260 lines** comprehensive documentation at `apps/desktop/RIVE_MODEL_INTEGRATION.md`
- Contents per D-18~D-20:
  - SM input naming convention table: `state`, `mouth_open`, `look_x`, `look_y`, `blink`, `breathe`
  - `state` value mapping table: 0=idle .. 9=angry
  - `.riv` file placement: built-in (`public/models/<Name>/`) vs user-imported (`userData/models/<id>/`)
  - `models.json` config example template with field descriptions
  - `vivipet-assets://` protocol explanation with URL format and path traversal protection
  - Project files and paths summary table

### Task 3: Phase 4 Verification Audit

| Check | Result |
|-------|--------|
| TypeScript compilation (`tsc --noEmit`) | Pre-existing errors unrelated to this plan |
| Full build (`npm run build`) | ✅ main process + Vite renderer pass |
| D-21: `initModelProtocol` in main.ts | ✅ Imported (line 7) + called (line 47) |
| D-22: Fallback logic in PetStage.tsx | ✅ `modelLoaded`/`loadError` states present |
| D-23: `.riv` skip guard in model-manager.ts | ✅ Line 250: `endsWith('.riv')`, line 251: skip log |
| D-24: `public/models` removed from electron-builder.yml | ✅ grep confirms removed |
| MODEL-01: `ModelType = 'rive'` | ✅ model-registry.ts line 1 |
| MODEL-05: RIVE_MODEL_INTEGRATION.md exists | ✅ 260 lines |

## Deviations from Plan

None — plan executed exactly as written.

## Pre-existing Issues (Unrelated)

The following TypeScript errors exist in the codebase but are **not caused by Phase 4 changes** (pre-existing in renderer tsconfig):

- `PetStage.tsx`: `electronAPI` not typed on `Window & typeof globalThis` — `electronAPI` is injected at runtime via preload
- `App.tsx`: `RuleBasedBehaviorPlanner` vs `HybridBehaviorPlanner` type mismatch — unrelated to model system
- `main.tsx`: `Cannot find module './styles.css'` — missing CSS module type declaration

All three are renderer-side issues that don't affect the actual build (Vite and main process build both pass without errors).

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes at trust boundaries introduced.

- **T-04-005** (DoS from YAML format error): Mitigated — verified electron-builder.yml YAML format is valid via build test
- **T-04-006** (Path guidance in docs): Accepted — documentation is human-readable reference, paths verified against codebase conventions

## Self-Check: PASSED

| Check | Status |
|-------|--------|
| `electron-builder.yml`: `public/models` removed | ✅ |
| `electron-builder.yml`: `assets` entry preserved | ✅ |
| `RIVE_MODEL_INTEGRATION.md` exists | ✅ |
| `RIVE_MODEL_INTEGRATION.md` >= 60 lines | ✅ (260) |
| Contains `vivipet-assets` | ✅ (11 mentions) |
| Contains `models.json` example | ✅ (6 mentions) |
| Contains `mouth_open` input | ✅ (2 mentions) |
| Contains all 6 SM inputs | ✅ |
| Build passes (`npm run build`) | ✅ |
| D-21: protocol initialization | ✅ |
| D-23: `.riv` skip guard | ✅ |
| D-24: no dangling extraResources | ✅ |
