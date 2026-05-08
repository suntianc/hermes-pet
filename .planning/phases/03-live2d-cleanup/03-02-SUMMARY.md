---
phase: 03-live2d-cleanup
plan: 02
subsystem: cleanup
tags: live2d, cubism, cleanup, config, vite, typescript

# Dependency graph
requires:
  - phase: 03-live2d-cleanup
    plan: 01
    provides: Physical deletion of all Live2D/Cubism 5 files
provides:
  - Removal of @framework alias from vite.config.mts and tsconfig.json paths
  - Removal of 'live2d' from ModelType and PetRendererType type unions
  - Cleaned FALLBACK_MODELS (no longer references deleted .model3.json path)
  - Removal of Live2D WASM loadScript from main.tsx
affects:
  - 03-03 Plan (App.tsx pet-performance-director import fix, model-manager.ts cleanup)

# Tech tracking
tech-stack:
  added: []
  patterns: []

key-files:
  created: []
  modified:
    - apps/desktop/vite.config.mts
    - apps/desktop/tsconfig.json
    - apps/desktop/src/features/pet/model-registry.ts
    - apps/desktop/src/features/pet/PetRenderer.ts
    - apps/desktop/src/main.tsx

key-decisions:
  - "D-10: Remove @framework alias from vite.config.mts (line 16)"
  - "D-11: Remove @framework/* paths from tsconfig.json (line 18)"
  - "D-13: Remove 'live2d' from ModelType; clear FALLBACK_MODELS"
  - "D-14: Remove 'live2d' from PetRendererType"
  - "D-12: Remove loadScript() function + live2dcubismcore.js load call from main.tsx"

patterns-established: []

requirements-completed: [CLEAN-05, CLEAN-06]

# Metrics
duration: 10min
completed: 2026-05-08
---

# Phase 3 Plan 02: Fix Config/Type References Summary

**修复因 Live2D 大爆炸删除产生的 5 个配置文件/类型定义/入口文件中的悬空引用 — 移除 @framework 别名、清除 'live2d' 联合类型值、移除 WASM 动态加载**

## Performance

- **Duration:** 10 min
- **Started:** 2026-05-08
- **Completed:** 2026-05-08
- **Tasks:** 3
- **Files modified:** 5
- **Lines removed:** 57

## Accomplishments

### CLEAN-05: 配置文件引用清理
- **vite.config.mts:** 删除 `'@framework'` 别名行（指向已删除的 `src/vendor/cubism`）
- **tsconfig.json:** 删除 `"@framework/*"` 路径映射条目

### CLEAN-06: 源代码引用清理
- **model-registry.ts:**
  - `ModelType`: `'live2d' | 'rive'` → `'rive'`
  - `FALLBACK_MODELS`: 清空为 `[]`（原引用已删除的 `Jian.model3.json` 路径）
- **PetRenderer.ts:** `PetRendererType`: `'live2d' | 'spine' | 'gif' | 'vrm'` → `'spine' | 'gif' | 'vrm'`
- **main.tsx:** 删除 `loadScript()` 工具函数 + `await loadScript('./live2dcubismcore.js')` 调用（Rive 的 WASM 由 `@rive-app/canvas` 自动管理）

## Task Commits

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Remove @framework alias from configs | `63c2577` | vite.config.mts, tsconfig.json |
| 2 | Remove 'live2d' from types + clear FALLBACK_MODELS | `8df9bbc` | model-registry.ts, PetRenderer.ts |
| 3 | Remove WASM loadScript from main.tsx | `7a9c305` | main.tsx |

## Verification Results

| Check | Result |
|-------|--------|
| Config: @framework removal | ✅ PASS |
| Types: 'live2d' removal | ✅ PASS |
| main.tsx: live2dcubismcore/loadScript removal | ✅ PASS |
| Grep audit: Zero Live2D source references | ✅ PASS |
| npm run build:renderer (Task 3 verify) | ⚠️ FAIL (see below) |

### Build Status

`npm run build:renderer` 在 Task 3 验证中失败，原因是 `App.tsx` 引用已删除的 `./features/pet-performance/pet-performance-director`。这是 Plan 03-01 删除的 PetPerformanceDirector，其引用清理在 CONTEXT.md D-15 中明确推迟到 **Plan 03-03**。

Plan 03-02 仅覆盖 5 个指定文件（配置 + 类型 + main.tsx），App.tsx 不在范围内。完整编译需等 Plan 03-03 执行完毕。

## grep 审计详情

```bash
# 搜索 live2d|cubism|.moc3|.model3|live2dcubism
# Scope: apps/desktop/src, apps/desktop/electron, configs
# Result: 零匹配 ✅
```

## Deviations from Plan

None — plan executed exactly as written.

## Known Dependencies

- **Plan 03-03 需修复:** `App.tsx` 中 `import './features/pet-performance/pet-performance-director'` 的悬空引用
- **Plan 03-03 需修复:** `electron/model-manager.ts` 中 `import extractZip from 'extract-zip'` 和 `.model3.json` 扫描逻辑
- **Plan 03-03 需修复:** `package.json` 中移除 `gsap` 和 `extract-zip` 依赖
- **Plan 03-03 需修复:** `public/assets/models/models.json` 中移除 Live2D 模型条目

## Files Modified

### apps/desktop/vite.config.mts
- 删除 `'@framework'` 别名行（Line 16）
- 保留：`@`, `@pet-action-dsl`, `@shared`

### apps/desktop/tsconfig.json
- 删除 `"@framework/*"` 路径映射（Line 18）
- 保留：`@/*`, `@pet-action-dsl`, `@shared`

### apps/desktop/src/features/pet/model-registry.ts
- `ModelType`: `'live2d' | 'rive'` → `'rive'`
- `FALLBACK_MODELS`: 34 行 Jian 条目 → 空数组 `[]`

### apps/desktop/src/features/pet/PetRenderer.ts
- `PetRendererType`: `'live2d' | 'spine' | 'gif' | 'vrm'` → `'spine' | 'gif' | 'vrm'`

### apps/desktop/src/main.tsx
- 删除 `loadScript()` 函数定义（18 行）
- 删除 `await loadScript('./live2dcubismcore.js')` 调用
- `bootstrap()` 简化为仅包含 URL 检测 + 动态 import

## Self-Check: PASSED

- ✅ `apps/desktop/vite.config.mts` — 修改存在
- ✅ `apps/desktop/tsconfig.json` — 修改存在
- ✅ `apps/desktop/src/features/pet/model-registry.ts` — 修改存在
- ✅ `apps/desktop/src/features/pet/PetRenderer.ts` — 修改存在
- ✅ `apps/desktop/src/main.tsx` — 修改存在
- ✅ Commit `63c2577` — 存在
- ✅ Commit `8df9bbc` — 存在
- ✅ Commit `7a9c305` — 存在

---

*Phase: 03-live2d-cleanup*
*Completed: 2026-05-08*
