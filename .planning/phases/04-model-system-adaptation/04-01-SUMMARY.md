---
phase: 04-model-system-adaptation
plan: 01
subsystem: model-manager
tags: [model-import, rive, migration, refactor]
requires: []
provides: [MODEL-01, MODEL-02, MODEL-03]
affects: [apps/desktop/electron/model-manager.ts]
tech-stack:
  added: []
  patterns: [single-file-copy, registry-based-discovery, sqlite-skip-guard]
key-files:
  created: []
  modified:
    - apps/desktop/electron/model-manager.ts
decisions:
  - D-04: importModelViaDialog .riv file filter
  - D-05: .riv files copied to userData/models/<id>/ with .vivipet-registry.json
  - D-06: importModelZip removed, replaced by importRiveModel
  - D-07: listUserModels scans .vivipet-registry.json
  - D-08: indexBundledModels skips .riv paths before SQLite indexing
  - D-09: Rive models do not return actions (Rive SM handles animation internally)
metrics:
  duration: ~15min
  completed_date: 2026-05-08
---

# Phase 4 Plan 1: Rive Model Import Flow

Rewrite `model-manager.ts` from Live2D `.zip` processing to Rive `.riv` file handling — import dialog filters, file copy, registry-based discovery, and SQLite skip guard.

## Tasks

| # | Name                          | Type | Commit | Files Changed |
|---|-------------------------------|------|--------|---------------|
| 1 | Replace .zip import → .riv    | auto | `5144f75` | model-manager.ts (+46/-8) |
| 2 | Reimplement listUserModels    | auto | `e779500` | model-manager.ts (+41/-4) |
| 3 | Add .riv skip guard           | auto | `1bc578f` | model-manager.ts (+6/-0) |

## Key Changes

### Task 1: .riv Import Flow
- `importModelViaDialog()` dialog filter changed from `.zip` to `.riv`
- `importModelZip()` stub removed entirely (extract-zip already removed in Phase 3)
- New `importRiveModel(rivFilePath)` function:
  - Sanitizes filename with `toModelId()` for `modelId` generation
  - Creates `userData/models/<modelId>/` directory
  - Copies `.riv` file as `model.riv`
  - Writes `.vivipet-registry.json` with `{id, name, path, type: 'rive', window}`
  - Returns `null` on any error (try/catch wrapped)
  - Does NOT return `actions` — Rive SM handles animation (D-09)

### Task 2: Real listUserModels
- Removed stub that returned `[]` with a `console.warn`
- Scans `userData/models/*/.vivipet-registry.json` for real model configs
- Each registry read is isolated by try/catch (bad registry does not block others)
- Returns empty array if `userData/models/` directory does not exist (no side effects)
- Type signature unchanged for preload API compatibility

### Task 3: SQLite Skip Guard
- `indexBundledModels()` checks `model.path.endsWith('.riv')` before calling `resolveBundledModelPath()`
- Guard references D-08 decision: Rive SM handles animation internally
- Skip logged at `info` level (normal, non-error behavior)
- Non-.riv paths continue to use existing SQLite indexing unchanged

## Verification Results

| Check | Result |
|-------|--------|
| `importModelZip` removed from `apps/desktop/` | ✅ No matches |
| `.riv` dialog filter present | ✅ `extensions: ['riv']` |
| `importRiveModel` function present | ✅ 3 references |
| `.vivipet-registry.json` scanning | ✅ 5 references (write + read) |
| `endsWith('.riv')` guard in indexBundledModels | ✅ Line 250 |
| `Skipping SQLite index` log message | ✅ Line 251 |
| All 4 exports present | ✅ `initModelProtocol`, `importModelViaDialog`, `listUserModels`, `indexBundledModels` |
| ipc.ts import compatibility | ✅ Unchanged imports work |
| File line count | 285 (min: 240) |

## Deviations from Plan

None — plan executed exactly as written.

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes at trust boundaries introduced. File copy destination is constrained by `toModelId()` sanitization + `path.join()` within `userData/models/`. All threat mitigations (T-04-001 through T-04-004) are implemented.

## Self-Check: PASSED

All verification items confirmed:
- `importModelZip` removed from entire `apps/desktop/` tree
- `importRiveModel` function implemented with `fs.copyFileSync` + `.vivipet-registry.json` write
- `listUserModels` scans `.vivipet-registry.json` with try/catch isolation
- `indexBundledModels` skips `.riv` paths with info-level log
- Export signatures compatible with `ipc.ts` and `preload.ts`
