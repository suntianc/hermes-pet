# Phase 3: Live2D Cleanup - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-08
**Phase:** 3-Live2D Cleanup
**Areas discussed:** deletion strategy, CSS class cleanup, type cleanup, models.json, model-manager, verification

---

## Gray Areas (Agent Decision — User Delegated All)

All 6 gray areas were presented to the user. The user selected "全部由你决定，但务必保证清理干净" (agent decides all, but ensure thorough cleanup).

---

## Deletion Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Big bang | Delete everything then fix build | ✓ |
| Incremental | Delete file-by-file, commit each step | |

**Notes:** Big bang with git safety net. Build verification after all deletions.

---

## CSS Class Cleanup

| Option | Description | Selected |
|--------|-------------|----------|
| Rename to .rive-container | Change in App.tsx + pet-performance-director.ts | ✓ |
| Keep as-is | Leave legacy class name | |

**Notes:** 2 files affected. Straightforward find-and-replace.

---

## Type Definition Cleanup

| Option | Description | Selected |
|--------|-------------|----------|
| Remove 'live2d' from types | model-registry.ts + PetRenderer.ts | ✓ |
| Keep deprecated enum value | Leave for backward compatibility | |

**Notes:** No consumers of 'live2d' type remain.

---

## models.json Handling

| Option | Description | Selected |
|--------|-------------|----------|
| Remove Live2D entries | CLEAN-03 scope | ✓ |
| Convert to Rive entries | Phase 4 scope | |

**Notes:** Phase 4 adds .riv entries. This phase only removes Live2D entries.

---

## model-manager.ts Cleanup

| Option | Description | Selected |
|--------|-------------|----------|
| Partial: remove extract-zip + .model3 scanning | This phase | ✓ |
| Full rewrite for .riv | Phase 4 | |

**Notes:** model-manager.ts bulk structure stays. Phase 4 adapts for .riv.

---

## Verification Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| npm run build + grep | Compile + regex scan | ✓ |
| Visual verification | Launch app, check for errors | ✓ (supplementary) |

**Notes:** grep pattern: `live2d|cubism|\.moc3|\.model3|live2dcubism|extract-zip|gsap`

---

## the agent's Discretion

- Whether to delete `loadScript()` function in main.tsx (keep if Rive WASM still uses it)
- FALLBACK_MODELS handling — can be removed or left empty
- File deletion order — any sequence that results in clean build is fine

## Deferred Ideas

- model-manager.ts .riv adaptation — Phase 4
- action-index.ts evaluation — Phase 4
- vivipet-assets:// protocol cleanup — Phase 4
- electron-builder.yml extraResources update — Phase 4
