---
phase: 03-live2d-cleanup
plan: 03
subsystem: cleanup
tags: live2d, cubism, cleanup, App.tsx, model-manager, package.json

# Dependency graph
requires:
  - phase: 03-live2d-cleanup
    plan: 01
    provides: Physical deletion of all Live2D/Cubism 5 files
  - phase: 03-live2d-cleanup
    plan: 02
    provides: Config/type/WASM reference cleanup
provides:
  - App.tsx: PetPerformanceDirector 引用移除 + CSS 类名重命名
  - models.json: Live2D 模型条目清空
  - model-manager.ts: extract-zip import 移除 + .model3.json 函数删除
  - package.json: gsap + extract-zip 依赖卸载
affects:
  - Phase 4 (.riv model import in model-manager.ts, model registry population)

# Tech tracking
tech-stack:
  added: []
  patterns: []

key-files:
  created: []
  modified:
    - apps/desktop/src/App.tsx
    - apps/desktop/public/assets/models/models.json
    - apps/desktop/electron/model-manager.ts
    - apps/desktop/package.json

key-decisions:
  - "D-15: Remove PetPerformanceDirector import/ref/useEffect/playPose/playSpeech from App.tsx; rename .live2d-container → .rive-container"
  - "D-17: Clear models.json models array — Phase 4 will add .riv entries"
  - "D-18: Remove extract-zip import + .model3.json scan/validate/parse functions from model-manager.ts; stub importModelZip"
  - "D-19: Uninstall gsap (PetPerformanceDirector deleted in Plan 01) + extract-zip (model-manager.ts cleaned)"

patterns-established: []

requirements-completed: [CLEAN-07]

# Metrics
duration: 15min
completed: 2026-05-08
---

# Phase 3 Plan 03: Live2D Source Reference Cleanup Summary

**清除 App.tsx、models.json、model-manager.ts、package.json 中所有 Live2D/Cubism 残留引用和死依赖 — 4 个文件修改，npm run build 全量编译通过**

## Performance

- **Duration:** 15 min
- **Started:** 2026-05-08
- **Completed:** 2026-05-08
- **Tasks:** 3
- **Files modified:** 4
- **Lines removed:** 284
- **Dependencies removed:** 2 (gsap, extract-zip)

## Accomplishments

### Task 1: App.tsx — PetPerformanceDirector 移除 + CSS 类名重命名
- 删除 `import { PetPerformanceDirector }` 语句
- 删除 `performanceDirectorRef` ref 声明
- 删除 PetPerformanceDirector 初始化 useEffect（`new PetPerformanceDirector()`）
- 删除 playPose 调用 useEffect（监听 currentAction 变化）
- 删除 playSpeech 调用 useEffect（监听 bubble/speaking 状态）
- `.live2d-container` → `.rive-container`（与 PetStage.tsx 同步）
- 保留 `performanceHint`/`setPerformanceHint` 状态（行为规划系统独立于 PetPerformanceDirector）
- 保留 `setPerformanceHint` 在 `scheduleRuntimeRefresh` 和 `applyPetStateEvent` 中的使用

### Task 2: models.json + model-manager.ts
- **models.json**: 清空 `models` 数组（移除 Jian/Vivian 的 Live2D 条目，共 91 行），保留空结构供 Phase 4
- **model-manager.ts**:
  - 移除 `import extractZip from 'extract-zip'` (line 6)
  - 删除 `findPackagedModel3()` — .model3.json 文件扫描
  - 删除 `validateModelPackage()` — .model3.json 包验证
  - 删除 `parseModel3References()` — .model3.json 引用解析（60 行）
  - 删除 `importModelFromPath()` — 死代码（仅被 now-stubbed importModelZip 调用）
  - `importModelZip()` → 返回 null 的桩，控制台警告 Phase 4
  - 保留：`importModelViaDialog()`、`listUserModels()`、`indexBundledModels()`、`toRendererActions()`、`toModelId()`
  - 260 行 Live2D 逻辑从主进程移除

### Task 3: package.json — 依赖清理
- `gsap` 已卸载（PetPerformanceDirector 唯一使用者，该文件已在 Plan 01 删除）
- `extract-zip` 已卸载（model-manager.ts 唯一使用者，本 Task 2 已清理）
- `npm uninstall gsap extract-zip` 执行成功
- `package-lock.json` 同步更新

### CLEAN-07 达成
验证要求：项目中无代码引用 gsap 或 extract-zip。

## Task Commits

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Remove PetPerformanceDirector + rename CSS class | `3c1cf8b` | App.tsx |
| 2 | Clean models.json + model-manager.ts | `b6a47db` | models.json, model-manager.ts |
| 3 | Remove gsap + extract-zip dependencies | `9db8b85` | package.json |

## Verification Results

| # | Check | Result |
|---|-------|--------|
| 1 | App.tsx: No PetPerformanceDirector refs | ✅ PASS |
| 2 | App.tsx: .live2d-container → .rive-container | ✅ PASS |
| 3 | models.json: No Live2D entries | ✅ PASS |
| 4 | model-manager.ts: No extract-zip import | ✅ PASS |
| 5 | model-manager.ts: No findPackagedModel3/validateModelPackage/parseModel3References | ✅ PASS |
| 6 | package.json: gsap removed | ✅ PASS |
| 7 | package.json: extract-zip removed | ✅ PASS |
| 8 | npm run build (main + renderer) | ✅ PASS |
| 9 | Grep audit: gsap source refs = 0 | ✅ PASS |
| 10 | Grep audit: extract-zip source refs = 0 | ✅ PASS |

## Deviations from Plan

### Rule 3 — Auto-fix blocking issue: importModelFromPath dead code

**Found during:** Task 2 (model-manager.ts cleanup)

**Issue:** `importModelFromPath()` 调用了已删除的 `parseModel3References()` 且仅被已替换为桩的 `importModelZip()` 调用。如果不处理会导致 TypeScript 编译错误。

**Fix:** 将 `importModelFromPath()` 整体删除（该函数已无调用者，.riv 模型导入将在 Phase 4 重新实现）。

**Files modified:** `apps/desktop/electron/model-manager.ts`

**Commit:** `b6a47db`

**Rationale:** `importModelFromPath` 是私有的 Live2D 导入路径实现，依赖 `parseModel3References()`（已删除）。Phase 4 将用全新的 .riv 导入逻辑替代。删除此死代码是移除 260 行 Live2D 残留的正确操作。

## Known Stubs

| Stub | File | Lines | Reason |
|------|------|-------|--------|
| `importModelZip()` stub | `electron/model-manager.ts` | ~105-114 | 临时占位 — Phase 4 实现 .riv .zip 导入 |

## Files Modified

### apps/desktop/src/App.tsx
- **删除 24 行**: PetPerformanceDirector import(1), ref(1), init useEffect(8), playPose useEffect(7), playSpeech useEffect(3), .live2d-container→.rive-container(1 change)
- **插入 3 行**: `.rive-container` 替换
- 当前行数: 717 (原 738)

### apps/desktop/public/assets/models/models.json
- 93 行 Live2D 模型条目 → 3 行空数组 `{"models":[]}`
- 数据：`[]` 空数组预留给 Phase 4 填充 .riv 条目

### apps/desktop/electron/model-manager.ts
- 411 行 → 177 行（-234 行）
- 删除: `extractZip` import, `findPackagedModel3`, `validateModelPackage`, `parseModel3References`, `importModelFromPath`
- 简化: `importModelZip` → Phase 4 桩
- 保留: `importModelViaDialog`, `listUserModels`, `indexBundledModels`, `toRendererActions`, `toModelId`, `initModelProtocol`, `resolveUserModelPath`, `resolveSafeUserModelPath`, `copyDirectoryIfExists`, `findFiles`

### apps/desktop/package.json
- `dependencies`: 删除 `"gsap": "^3.15.0"` 和 `"extract-zip": "^2.0.1"` 条目
- 当前 7 个 runtime 依赖

## Full grep Audit

Search: `gsap|extract-zip` in `apps/desktop/src`, `apps/desktop/electron`
Result: Zero matches ✅

Search: `live2d|cubism|\.moc3|\.model3|live2dcubism` in source files
Result: Zero source code references ✅ (note: `model3File` field references in `listUserModels` are reading from existing registry files, not importing Live2D logic)

## Phase 3 Completion Status

All 3 plans completed:
- **Plan 01**: 126 Live2D files deleted ✅
- **Plan 02**: 5 config/type/WASM files fixed ✅
- **Plan 03**: 4 source/data/dependency files cleaned ✅
- **npm run build**: main (tsc) + renderer (vite) — zero errors ✅

Ready for Phase 4 (.riv model system, model-manager.ts adapter, model registry population).

## Self-Check: PASSED

- ✅ `apps/desktop/src/App.tsx` — 修改存在
- ✅ `apps/desktop/public/assets/models/models.json` — 修改存在
- ✅ `apps/desktop/electron/model-manager.ts` — 修改存在
- ✅ `apps/desktop/package.json` — 修改存在
- ✅ Commit `3c1cf8b` — 存在
- ✅ Commit `b6a47db` — 存在
- ✅ Commit `9db8b85` — 存在

---

*Phase: 03-live2d-cleanup*
*Plan: 03 (Wave 2)*
*Completed: 2026-05-08*
