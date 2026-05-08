# Phase 3: Live2D Cleanup — Research

**Researched:** 2026-05-08
**Domain:** Code cleanup / dead code removal
**Confidence:** HIGH

## Summary

Phase 3 removes all Live2D/Cubism 5 artifacts from the codebase: 126 files to delete, 7 files to modify, and 2 package dependencies to remove. Phases 1 & 2 have fully replaced Live2D rendering with Rive, making all Live2D code dead. The big bang deletion strategy (D-01) is the correct approach — delete everything, then fix TypeScript compilation errors.

**Primary recommendation:** Delete all Live2D files/dirs first, then fix remaining references in 5 source files + 2 config files. Use `npm run build` as the definitive verification tool.

**Critical finding — D-19 conflict:** CONTEXT.md D-19 says to remove `gsap` from `package.json`, but `pet-performance-director.ts` (active, live code) imports and uses `gsap` in 10 places. Removing `gsap` **will break the build**. The planner MUST choose: (a) keep `gsap` (contradict D-19) or (b) refactor `pet-performance-director.ts` to use CSS animations / Web Animations API instead.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### 删除策略
- **D-01:** 一次性大爆炸删除 — 先删所有 Live2D 文件和目录，然后修复编译错误。git 可安全回滚，无需中间步骤。
- **D-02:** 删除后通过 `npm run build`（TypeScript 编译）验证无残留引用

#### 要删除的文件和目录
- **D-03:** 删除 `src/vendor/cubism/` — Cubism 5 Framework SDK
- **D-04:** 删除 `src/vendor/live2dcubismcore.d.ts` — Cubism Core 类型定义
- **D-05:** 删除 `public/live2dcubismcore.js` — Cubism Core WASM 加载器
- **D-06:** 删除 `public/Framework/` — WebGL shader 文件
- **D-07:** 删除 `public/models/` — 所有 Live2D 模型文件
- **D-08:** 删除 `src/features/pet/Live2DRenderer.ts`
- **D-09:** 删除 `src/features/pet/capability-resolver.ts`

#### 要修改的配置文件
- **D-10:** `vite.config.mts` — 移除 `@framework` 别名
- **D-11:** `tsconfig.json` — 移除 `@framework/*` 路径映射

#### 要修改的源文件
- **D-12:** `src/main.tsx` — 移除 Cubism WASM 加载
- **D-13:** `src/features/pet/model-registry.ts` — 从 `ModelType` 移除 `'live2d'`
- **D-14:** `src/features/pet/PetRenderer.ts` — 从 `PetRendererType` 移除 `'live2d'`
- **D-15:** `src/App.tsx:415` — 将 `.live2d-container` 改为 `.rive-container`
- **D-16:** `src/features/pet-performance/pet-performance-director.ts:12` — 将 `.live2d-container` 改为 `.rive-container`

#### 要修改的数据文件
- **D-17:** `public/assets/models/models.json` — 移除现有 Live2D 模型条目

#### 要修改的主进程文件
- **D-18:** `electron/model-manager.ts` — 移除 `extract-zip` 导入和 `.model3.json` 扫描逻辑
- **D-19:** `package.json` — 移除 `gsap` 和 `extract-zip` 依赖

#### 验证策略
- **D-20:** 删除后用 `npm run build` 确保 TypeScript 编译零错误
- **D-21:** 用 grep 搜索 `live2d|cubism|\.moc3|\.model3|live2dcubism` 确认无残留引用
- **D-22:** `npm run dev:renderer` 确认应用启动正常

### the agent's Discretion
- `loadScript()` 函数在 main.tsx 中是否删除
- FALLBACK_MODELS 的处理（移除或改为示例 .riv）
- 删除文件的精确顺序

### Deferred Ideas (OUT OF SCOPE)
- `electron/model-manager.ts` 完整 .riv 适配 — Phase 4
- `electron/action-index.ts` 重构或清理 — Phase 4
- `vivipet-assets://` 协议清理 — Phase 4
- 添加 Rive .riv 示例模型文件 — Phase 4
- `electron-builder.yml` 中 extraResources 调整（移除 public/models/） — Phase 4

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CLEAN-01 | Remove `src/vendor/cubism/` directory (~200 files) | 实际 59 个 .ts 文件，并非 200 — 见 Files to DELETE |
| CLEAN-02 | Remove `public/live2dcubismcore.js` and `public/Framework/` | 1 个 JS + 13 个 shader 文件 — 见 Files to DELETE |
| CLEAN-03 | Remove `public/models/` Live2D model files | 50 个文件（Jian 23 + Vivian 27） — 见 Files to DELETE |
| CLEAN-04 | Delete `Live2DRenderer.ts` and `capability-resolver.ts` | 891 行 + 55 行 — 删除后确认无 import 残留 |
| CLEAN-05 | Update `vite.config.mts` and `tsconfig.json` | 已验证 `@framework` 仅在这 2 个文件 + Live2DRenderer.ts 中出现 |
| CLEAN-06 | Update `src/main.tsx` | 单行删除: `await loadScript('./live2dcubismcore.js')` |
| CLEAN-07 | Remove unused packages (gsap, extract-zip) | **⚠️ 风险:** gsap 仍被 `pet-performance-director.ts` 使用 — 见 Critical Findings |

</phase_requirements>

## Architectural Responsibility Map

Phase 3 is a pure cleanup phase with no architectural changes. No architectural tiers are involved — all work is file-level deletion and reference cleanup.

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| File deletion | N/A | N/A | All deletions are dead code removal |
| Config cleanup | N/A | N/A | Vite/TSConfig are build-time configs |
| Main process cleanup | Electron Main | — | model-manager.ts runs in main process |
| CSS class rename | Renderer | — | Source code string replacement |

## Complete Inventory

### Files to DELETE (126 files)

| Path | Type | Count | Size / Lines |
|------|------|-------|-------------|
| `apps/desktop/src/vendor/cubism/` | Cubism 5 Framework SDK | 59 `.ts` files | ~22K lines |
| `apps/desktop/src/vendor/live2dcubismcore.d.ts` | Cubism Core type defs | 1 file | 15 KB |
| `apps/desktop/public/live2dcubismcore.js` | Cubism Core WASM loader | 1 file | 247 KB |
| `apps/desktop/public/Framework/` | WebGL shaders | 13 files (6 vert, 7 frag) | ~2 KB each |
| `apps/desktop/public/models/` | Live2D models (Jian + Vivian) | 50 files | 23 + 27 files |
| `apps/desktop/src/features/pet/Live2DRenderer.ts` | Cubism 5 WebGL renderer | 1 file | 891 lines |
| `apps/desktop/src/features/pet/capability-resolver.ts` | Capability resolver | 1 file | 55 lines |

**Total: 126 files removed** — models/ contains textures (.png), moc3, model3.json, physics3.json, motion3.json, exp3.json, cdi3.json.

### Files to MODIFY (7 files)

| File | Change | Verification |
|------|--------|-------------|
| `apps/desktop/src/main.tsx` | Remove `await loadScript('./live2dcubismcore.js');` (line 38) | TypeScript compile: no `live2dcubismcore` reference |
| `apps/desktop/vite.config.mts` | Remove `@framework` alias (line 16) | Build: no `@framework` module resolution error |
| `apps/desktop/tsconfig.json` | Remove `@framework/*` path (line 18) | Build: no `@framework` path mapping error |
| `apps/desktop/src/features/pet/model-registry.ts` | Remove `'live2d'` from ModelType (line 1); handle FALLBACK_MODELS | 编译器: `'live2d'` 不再是类型一部分 |
| `apps/desktop/src/features/pet/PetRenderer.ts` | Remove `'live2d'` from PetRendererType (line 22) | 编译器: `'live2d'` 不再是联合类型成员 |
| `apps/desktop/src/App.tsx` | `.live2d-container` → `.rive-container` (line 415) | 运行时: CSS 类名正确 |
| `apps/desktop/src/features/pet-performance/pet-performance-director.ts` | `.live2d-container` → `.rive-container` (line 12) | 运行时: `querySelector` 能找到正确的 DOM 元素 |

### Files to ADD

None — this is a cleanup phase only.

## Standard Stack

N/A — this is a cleanup phase, not a technology integration phase. The standard stack stays the same (React 19, Vite 5, TypeScript 5.5, Electron 41, @rive-app/canvas).

## Don't Hand-Roll

N/A — nothing new is being built.

## Architecture Patterns

### Recommended Deletion Order

For maximum build stability, this specific order minimizes "compilation error cascade":

```
Wave A: Delete files with NO external dependents
  → src/vendor/cubism/ (59 files — @framework alias)
  → src/vendor/live2dcubismcore.d.ts
  → public/live2dcubismcore.js
  → public/Framework/ (13 shader files)
  → public/models/ (50 Live2D model files)
  
Wave B: Delete files that other code may import
  → src/features/pet/capability-resolver.ts (55 lines)
  → src/features/pet/Live2DRenderer.ts (891 lines)
  → No code imports these except each other

Wave C: Fix configuration aliases that pointed to deleted dirs
  → vite.config.mts — remove @framework
  → tsconfig.json — remove @framework/*

Wave D: Fix source code compiling against deleted type values
  → model-registry.ts — remove 'live2d' from ModelType
  → PetRenderer.ts — remove 'live2d' from PetRendererType

Wave E: Fix runtime references
  → main.tsx — remove live2dcubismcore.js script load
  → App.tsx — .live2d-container → .rive-container
  → pet-performance-director.ts — .live2d-container → .rive-container
  → models.json — remove Live2D model entries
  → model-manager.ts — remove extract-zip + .model3.json logic
  → package.json — remove extract-zip (gsap: see Critical Findings)
  → electron-builder.yml — remove public/models extraResources entry
```

**Rationale:** The @framework alias is only used by Live2DRenderer.ts, so deleting it first makes Wave C trivial. ModelType 'live2d' and PetRendererType 'live2d' are never used in conditional branches (no `if (type === 'live2d')` exists), so removing them from the union types is safe.

### Verification That 'live2d' Type Values Aren't Used in Conditionals

[VERIFIED: codebase grep] No conditional logic exists that checks `modelConfig.type === 'live2d'` or `rendererType === 'live2d'`. The `ModelType` and `PetRendererType` union types are type-level declarations used for type safety, not runtime branching. Removing `'live2d'` from these unions is a pure type narrowing.

## Common Pitfalls

### Pitfall 1: gsap Removal Breaking pet-performance-director.ts
**What goes wrong:** Removing `gsap` from `package.json` while `pet-performance-director.ts` imports it causes `npm run build` to fail with `Cannot find module 'gsap'`.
**Why it happens:** CONTEXT.md D-19 instructs removal of `gsap`, but the `PetPerformanceDirector` class is **live code** that creates GSAP timelines, tweens, and animations.
**How to avoid:** Either (a) keep `gsap` as a dependency (contradict D-19), or (b) refactor `pet-performance-director.ts` to replace GSAP with CSS Animations or Web Animations API.
**Warning signs:** Build error: `Cannot find module 'gsap' or its corresponding type declarations.`

### Pitfall 2: electron-builder.yml References Deleted public/models/
**What goes wrong:** After Phase 3 deletes `public/models/`, the `electron-builder.yml` `extraResources` section references a non-existent directory.
**Why it happens:** CONTEXT.md defers `electron-builder.yml` cleanup to Phase 4, but Phase 3 deletes the directory. Builder will produce a `ENOENT: no such file` warning/error during packaging.
**How to avoid:** Also remove the `public/models` → `models` entry from `electron-builder.yml:12-13` in Phase 3 rather than deferring to Phase 4.
**Warning signs:** `electron-builder` fails with "cannot find file" during packaging.

### Pitfall 3: ModelType 'live2d' Removal Causes Type Errors in PetStage
**What goes wrong:** If any component assigns a `ModelConfig` with type 'live2d', removing 'live2d' from the union will cause a TS error.
**Why it happens:** The runtime JSON (`models.json`) is fetched at runtime — it's not type-checked at compile time. But any hardcoded `ModelType = 'live2d'` will break.
**How to avoid:** Must verify the `RiveRenderer` doesn't check `modelConfig.type === 'live2d'` anywhere. Grep for `type.*live2d` pattern after cleanup.
**Warning signs:** `Type '"live2d"' is not assignable to type 'ModelType'` during compilation.

### Pitfall 4: CSS Class Name Inconsistency
**What goes wrong:** If only one of the two `.live2d-container` references is changed, the class won't match.
**Why it happens:** Two separate files reference the same CSS class (`App.tsx:415` and `pet-performance-director.ts:12`). Easy to miss one.
**How to avoid:** After changes, grep for `.live2d-container` to confirm 0 matches. Then grep for `.rive-container` to confirm 2 matches.
**Warning signs:** Runtime: `querySelector('.rive-container')` returns null; DOM still has `.live2d-container` from PetStage.

### Pitfall 5: Main Process model-manager.ts Still Compiles with extract-zip Removed
**What goes wrong:** Removing `extract-zip` from `package.json` but only removing the import from `model-manager.ts` (line 6) works for compilation, but the `extractZip()` call on line 228 also needs removal. The entire `importModelZip()` function path needs cleanup.
**How to avoid:** Remove all code paths that call `extractZip()` and the functions only they call: `importModelZip`, `findPackagedModel3`, `validateModelPackage`, `parseModel3References`. Alternatively, keep the `importModelViaDialog()` signature but replace the body with a placeholder for Phase 4 .riv import.
**Warning signs:** Runtime error: `extractZip is not a function` if the import removal is somehow incomplete.

## Critical Findings

### 🚨 FINDING 1: gsap Cannot Be Removed (D-19 Conflict)

`gsap` is used exclusively by `pet-performance-director.ts` (10 reference points). This file is ACTIVE code:
- Initialized in `App.tsx` `useEffect` (line 99-105)
- `playPose()` called on every `currentAction` change (line 108-113)
- `playSpeech()` called on bubble/speaking state (line 116)
- `dispose()` called on component unmount (line 101-104)

**Options for planner:**
1. **KEEP gsap** — Remove `gsap` from D-19's scope. The `extract-zip` part of D-19 is still valid since it's only used by dead code paths. Risk: None. Impact: gsap stays as a dependency.
2. **REFACTOR pet-performance-director.ts** — Replace GSAP with CSS transitions / Web Animations API. Scope increase: ~50-80 line refactor. Risk: Low-medium (CSS animations are well-supported in Electron/Chromium).
3. **DELETE pet-performance-director.ts** — If the "performance director" is no longer needed (all visual effects come from Rive now). Requires checking whether the bounce/scale animations are visible over the Rive canvas. App.tsx lines 98-117 would need corresponding removal.

**Recommendation:** Option 1 (keep gsap) is the safest for a cleanup phase. If we remove gsap, pet-performance-director.ts must be refactored — that's non-trivial scope creep for a cleanup phase.

### 🚨 FINDING 2: electron-builder.yml Needs Update in Phase 3

`electron-builder.yml:12-13` references `public/models` as an extra resource:
```yaml
  - from: public/models
    to: models
```

After Phase 3 deletes `public/models/`, this builder rule will fail during packaging. **Despite Phase 4 deferral**, this must be removed in Phase 3 because the directory won't exist.

### FINDING 3: `extract-zip` Is Cleanly Removable

`extract-zip` is imported ONLY in `electron/model-manager.ts:6` and used ONLY in `importModelZip()` at line 228. The functions to remove along with it:
- `importModelZip()` — the entire function (lines 218-242)
- `importModelViaDialog()` — references `importModelZip`, needs new body for Phase 4
- `findPackagedModel3()` — only called by `importModelZip`
- `validateModelPackage()` — only called by `importModelZip`
- `parseModel3References()` — only called by `importModelZip`
- The `rendererActionConfig` type (lines 11-15) — only used by .model3.json paths (but also used by `listUserModels` and `indexBundledModels`, so must keep)

The `importModelViaDialog()` function (lines 198-216) is used by IPC handler `pet:model:import` in `ipc.ts:109-111`. It should be kept as a shell for Phase 4 .riv import.

The `listUserModels()` and `indexBundledModels()` functions reference `model3File` which is `.model3.json` specific. These need modification for Phase 4 .riv support (OUT OF SCOPE for Phase 3).

Recommendation: In Phase 3, keep these functions but remove extract-zip import + internal `.model3.json` validation. The functions will still compile but their `.model3.json` logic will be dead until Phase 4 replaces them.

### FINDING 4: `@framework` Alias Used ONLY by Live2DRenderer.ts

Confirmed via grep: all 13 `@framework/*` imports are in `Live2DRenderer.ts` lines 1-13. Once that file is deleted, removing the alias from `vite.config.mts` and `tsconfig.json` is safe and won't affect any other code.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Cubism 5 Framework SDK (59 files) | Rive runtime + WASM | Phase 1&2 | Delete 59 vendor files |
| Live2D Core WASM (247KB JS) | Rive WASM auto-loaded | Phase 1 | Delete 1 large file |
| WebGL shaders (13 files) | Rive runtime manages rendering | Phase 1 | Delete 13 shader files |
| Live2D models (.moc3 + textures, 50 files) | Rive .riv models | Phase 4 | Delete 50 asset files |
| Live2DRenderer (891 lines) | RiveRenderer (~370 lines) | Phase 1 | Delete ~891 lines |
| GSAP DOM animations | CSS transitions / Web Animations API | *Not yet decided* | See Critical Finding 1 |

## Runtime State Inventory

> This phase is a code cleanup, not a rename/refactor. No runtime state changes needed. Items below are FYI only.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | SQLite action-index (electron/action-index.ts) stores Live2D motion group mappings | Phase 4 deferred — keep as-is |
| Live service config | None | — |
| OS-registered state | None | — |
| Secrets/env vars | None | — |
| Build artifacts | electron-builder.yml references public/models/ | Must update in Phase 3 despite Phase 4 deferral |

## Verification Checklist

### Pre-Cleanup: Document Baseline
```bash
# Count all Live2D references before cleanup
grep -rn "live2d\|cubism\|\.moc3\|\.model3\|live2dcubism\|extract-zip\|gsap" \
  --include="*.{ts,tsx,mts,js,json,yml}" apps/desktop/ \
  | grep -v "node_modules" | grep -v ".DS_Store"
# Expected: matches in all files listed in this research
```

### After Deletion Wave A+B: Verify Directories Removed
```bash
# These should all return "No such file or directory"
ls apps/desktop/src/vendor/cubism/ 2>&1
ls apps/desktop/src/vendor/live2dcubismcore.d.ts 2>&1
ls apps/desktop/public/live2dcubismcore.js 2>&1
ls apps/desktop/public/Framework/ 2>&1
ls apps/desktop/public/models/ 2>&1
ls apps/desktop/src/features/pet/Live2DRenderer.ts 2>&1
ls apps/desktop/src/features/pet/capability-resolver.ts 2>&1
```

### After All Changes: Zero Live2D References
```bash
# These should return ZERO matches
grep -rn "live2d\|cubism\|\.moc3\|\.model3\|live2dcubism\|@framework" \
  --include="*.{ts,tsx,mts}" apps/desktop/src apps/desktop/electron \
  apps/desktop/vite.config.mts apps/desktop/tsconfig.json
# Expected: 0 matches
```

### Build Verification (D-20)
```bash
npm run build    # Must exit 0 with zero errors
```

### Runtime Verification (D-22)
```bash
npm run dev:renderer   # Vite dev server starts on :5173
# Open browser: console should have no Live2D-related errors
```

### Grep: Confirm No Live2D in Dependencies (D-21)
```bash
# Also check package.json and lock files for extract-zip removal
grep -n "gsap\|extract-zip" apps/desktop/package.json
# If gsap kept: only gsap remains; extract-zip must be gone
```

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| TypeScript (`tsc`) | Build verification | ✓ | 5.5.x | — |
| Vite | Build verification | ✓ | 5.3.x | — |
| Node.js | Build toolchain | ✓ | — | — |
| npm | Package management | ✓ | — | — |

No external services or tools needed for this phase — it's purely source code cleanup.

## Validation Architecture

### Test Framework

Not applicable. Phase 3 is a cleanup phase with no new behavior to test. Verification is done via:
- `npm run build` (TypeScript compilation — enforces no dead references)
- `grep` for zero Live2D references

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CLEAN-01~07 | Build passes with zero Live2D references | smoke | `npm run build` | ❌ — run manually |
| CLEAN-01~07 | Zero grep matches | audit | `grep -rn "live2d\|cubism\|\.moc3\|\.model3\|live2dcubism" --include="*.{ts,tsx,mts}" apps/desktop/src apps/desktop/electron apps/desktop/vite.config.mts apps/desktop/tsconfig.json \| wc -l` | ❌ — run manually |

### Sampling Rate
- After each change: `npm run build` (compile is fast)
- Before phase gate: full grep audit + build

### Wave 0 Gaps
- No unit tests needed — this is a file deletion phase. Verification is TypeScript compilation success + grep audit.

## Security Domain

> `security_enforcement` not explicitly disabled in config; however, Phase 3 is a code cleanup phase with no new code, no network access, no data processing, and no authentication. No security-relevant changes.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | — |
| V3 Session Management | no | — |
| V4 Access Control | no | — |
| V5 Input Validation | no | — |
| V6 Cryptography | no | — |

This is a pure deletion phase — removing dead code that is no longer executed. Security posture is unchanged.

## Sources

### Primary (HIGH confidence)
- [VERIFIED: codebase grep] — All Live2D reference counts confirmed via grep
- [VERIFIED: npm registry] — gsap dependency status (used by pet-performance-director.ts)
- [VERIFIED: filesystem] — File counts confirmed via `find` and `ls`
- [VERIFIED: TypeScript analysis] — `@framework` imports verified as only in Live2DRenderer.ts
- [VERIFIED: codebase analysis] — No conditional branching on `'live2d'` type values

### Secondary (MEDIUM confidence)
- [VERIFIED: codebase grep] — CSS classes `.live2d-container` confirmed in exactly 2 files

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | No code branches check `modelConfig.type === 'live2d'` | Architecture Patterns | Low — if such branching exists, compile will catch it |
| A2 | `PetPerformanceDirector` with gsap is still needed | Critical Findings | Medium — if removed and no visual effect visible, Option 3 becomes viable |

## Open Questions (RESOLVED)

1. **[RESOLVED] Does `PetPerformanceDirector` visual effects still work over Rive canvas?**
   - Decision: Delete `pet-performance-director.ts` entirely (D-16). Rive SM handles all pet animations. User confirmed: "既然都迁移到 rive 了，就用方案 3" (delete PetPerformanceDirector).
   - Plan: 03-01 Task 2: `git rm apps/desktop/src/features/pet-performance/pet-performance-director.ts`

2. **[RESOLVED] Can `importModelViaDialog()` be fully gutted?**
   - Decision: Keep function signature as Phase 4 placeholder stub, remove gsap/extract-zip code from its body. Return `null`.
   - Plan: 03-03 Task 2: model-manager.ts cleanup — remove extract-zip import + .model3.json logic, keep stubs.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new stack choices needed
- Architecture: HIGH — proven by Phase 1&2 execution
- Pitfalls: HIGH — all risks verified by source code audit

**Research date:** 2026-05-08
**Valid until:** N/A (cleanup phase, no external dependencies)
