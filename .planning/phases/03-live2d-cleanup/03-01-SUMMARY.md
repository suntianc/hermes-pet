---
phase: 03-live2d-cleanup
plan: 01
subsystem: cleanup
tags: live2d, cubism, cleanup, deletion, big-bang

# Dependency graph
requires:
  - phase: 02-animation-event-integration
    provides: Rive State Machine event pipeline (RiveRenderer, PetStage, pet-store SM inputs)
provides:
  - Physical deletion of all Live2D/Cubism 5 Framework SDK files and Core runtime
  - Physical deletion of all Live2D model assets (Jian + Vivian)
  - Physical deletion of Live2DRenderer, capability-resolver, PetPerformanceDirector
affects:
  - 03-02 Plan (config references: vite.config.mts, tsconfig.json, main.tsx, model-registry, PetRenderer)
  - 03-03 Plan (source references: App.tsx, model-manager.ts, package.json, models.json)

# Tech tracking
tech-stack:
  added: []
  patterns: []

key-files:
  created: []
  modified: []

key-decisions:
  - "D-01: Big bang deletion strategy - delete all before fixing compilation errors"

patterns-established: []

requirements-completed: [CLEAN-01, CLEAN-02, CLEAN-03, CLEAN-04]

# Metrics
duration: 5min
completed: 2026-05-08
---

# Phase 3 Plan 01: Big Bang Live2D Deletion Summary

**物理删除所有 Live2D/Cubism 5 代码、运行时、模型文件，以及被 Rive SM 替代的 PetPerformanceDirector — 共 126 个文件，56,010 行代码**

## Performance

- **Duration:** 5 min
- **Started:** 2026-05-08T00:00:00Z
- **Completed:** 2026-05-08T00:05:00Z
- **Tasks:** 2
- **Files deleted:** 126 (staged via git rm)

## Accomplishments

- **CLEAN-01:** 删除 Cubism 5 Framework SDK (59 .ts 文件, 24,987 行) + Cubism Core 类型定义 (live2dcubismcore.d.ts)
- **CLEAN-02:** 删除 Cubism Core WASM 加载器 (live2dcubismcore.js) + WebGL shader 文件 (13 .frag/.vert, Framework/ 目录)
- **CLEAN-03:** 删除所有 Live2D 模型文件 (Jian 22 文件 + Vivian 26 文件, public/models/ 目录)
- **CLEAN-04:** 删除 Cubism 5 WebGL 渲染器 (Live2DRenderer.ts, 891 行) + capability-resolver.ts (55 行)
- **D-16:** 删除 PetPerformanceDirector (GSAP 动画管理器, 被 Rive SM 替代)
- **总计:** 126 文件 / 56,010 行代码从仓库物理移除

## Task Commits

Each task was committed atomically:

1. **Task 1: Delete Cubism SDK vendor directories + Core files** — `a883390` (chore, 74 files)
2. **Task 2: Delete Live2D models, renderer, capability-resolver, PetPerformanceDirector** — `a32c13c` (chore, 52 files)

**Plan metadata:** — (summary commit, pending)

## Files Deleted

### Task 1 — Cubism SDK + Core (74 files)

| Group | Path | Count |
|-------|------|-------|
| Cubism 5 Framework SDK | `src/vendor/cubism/` | 59 .ts files |
| Cubism Core types | `src/vendor/live2dcubismcore.d.ts` | 1 |
| Cubism Core WASM loader | `public/live2dcubismcore.js` | 1 |
| WebGL Shaders | `public/Framework/Shaders/WebGL/` | 13 files (7 .frag + 6 .vert) |

### Task 2 — Models + Renderer + PetPerformanceDirector (52 files)

| Group | Path | Count |
|-------|------|-------|
| Jian model | `public/models/Jian/` | 22 files (.moc3, .model3.json, 6 motions, 10 expressions, .physics3, .cdi3, texture) |
| Vivian model | `public/models/Vivian/` | 26 files (.moc3, .model3.json, 7 motions, 6 expressions, .physics3, .cdi3, 11 textures) |
| Live2D Renderer | `src/features/pet/Live2DRenderer.ts` | 1 |
| Capability Resolver | `src/features/pet/capability-resolver.ts` | 1 |
| PetPerformanceDirector | `src/features/pet-performance/pet-performance-director.ts` | 1 (untracked, rm'd) |

## Decisions Made

- **D-01 (Big Bang):** 所有 Live2D 文件一次性删除 (两个 task 原子提交，最终状态一致)。Plan 02 & 03 修复由此产生的编译错误。
- **PetPerformanceDirector 未 tracking:** 文件在 Phase 2 创建但从未 `git add`，`git rm` 不可用 — 使用 `rm -rf` 直接删除。

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

- **`pet-performance-director.ts` 未在 git 中 tracking:** 该文件在 Phase 2 期间创建但未 `git add`，以 untracked 文件存在。无法用 `git rm` 删除，改用 `rm -rf`。不影响最终状态。
- **`.DS_Store` 残留:** `public/models/` 的 git rm 后留下 4 个 `.DS_Store` 文件（macOS 自动生成）。已手动清理后 `rm -rf` 空目录。

## Next Phase Readiness

- 所有 8 组 Live2D 文件/目录已删除
- 项目现在处于"断裂"状态 — TypeScript 编译将报错（预期行为）
- Plan 02 修复配置引用（vite.config.mts, tsconfig.json, main.tsx, model-registry, PetRenderer）
- Plan 03 修复源代码引用（App.tsx, model-manager.ts, package.json, models.json）

---
*Phase: 03-live2d-cleanup*
*Completed: 2026-05-08*
