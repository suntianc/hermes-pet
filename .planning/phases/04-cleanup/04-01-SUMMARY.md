---
phase: 04-cleanup
plan: 01
type: execute
subsystem: cleanup
tags: [rive-removal, cleanup, documentation, L2D-09, L2D-10, L2D-11]
requires: [01-live2d-core, 02-animation-interaction, 03-model-management]
affects: []
tech-stack:
  removed: ["@rive-app/canvas"]
  patterns: []
key-files:
  deleted:
    - apps/desktop/src/features/pet/RiveRenderer.ts
    - apps/desktop/src/features/pet/rive-inputs.ts
  modified:
    - apps/desktop/package.json
    - apps/desktop/src/components/PetStage.tsx
    - apps/desktop/src/App.tsx
    - apps/desktop/src/main.tsx
    - apps/desktop/src/features/pet/model-registry.ts
    - CLAUDE.md
decisions:
  - "保留 ModelType 'rive' 用于向后兼容旧导入模型"
  - "CLAUDE.md 全面更新为 Live2D 架构描述，删除所有 Rive 引用"
metrics:
  duration: "~15 min"
  completed_date: "2026-05-12"
---

# Phase 4 Plan 01: 移除 Rive 依赖与代码 + 文档更新

**One-liner:** 完全移除 Rive 渲染引擎（@rive-app/canvas、RiveRenderer.ts、rive-inputs.ts），清理所有 CSS/日志引用，更新 CLAUDE.md 为 Live2D 架构描述，构建验证通过。

## Tasks Executed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | 删除 RiveRenderer.ts 和 rive-inputs.ts | `faca106` | 2 files deleted (404 lines) |
| 2 | 从 package.json 移除 @rive-app/canvas | `e3d8b16` | package.json |
| 3 | 清理 Rive CSS 类名和日志 | `90183a7` | PetStage.tsx, App.tsx, main.tsx |
| 4 | 更新 model-registry.ts 注释 | `f7e6845` | model-registry.ts |
| 5 | 更新 CLAUDE.md 为 Live2D 架构 | `8fdb9c9` | CLAUDE.md (28+ / 30- lines) |
| 6 | 构建验证 + docs commit | `7e0c121` | PLAN docs |

## Key Changes

### 1. 文件删除
- **RiveRenderer.ts** (371 行) — Rive 渲染引擎，由 Live2DRenderer 替代
- **rive-inputs.ts** (33 行) — Rive 状态机输入常量 (STATE, BLINK, MOUTH_OPEN, LOOK_X/Y)

### 2. 依赖移除
- **@rive-app/canvas ^2.37.5** 从 package.json dependencies 移除

### 3. CSS 类名清理
- `rive-container` → `live2d-container` (PetStage.tsx)
- `.rive-container` → `.live2d-container` (App.tsx mouse passthrough 选择器)

### 4. 日志清理
- `console.log('[Rive] Using auto WASM (dev mode)')` 从 main.tsx 移除

### 5. CLAUDE.md 全面更新
- 架构描述: `Rive` → `Live2D Cubism 5 WebGL`
- Rive Rendering 章节 → Live2D Rendering（包含 Live2D 参数表、Motion 解析链）
- Event Pipeline: `RiveRenderer` → `Live2DRenderer`
- 文件表: RiveRenderer.ts/rive-inputs.ts → Live2DRenderer.ts/live2d-action-map.ts
- 模型系统: `.riv files` → `.moc3 / .model3.json 文件`
- 修正了 `list_user_models` → `model_list`

## Build Verification

```bash
npx vite build  # (clean dist, fresh build)
# 103 modules transformed, 511ms
# No Rive references in build output
```

## Success Criteria Check
- [x] @rive-app/canvas 从 package.json 移除
- [x] RiveRenderer.ts 和 rive-inputs.ts 文件删除
- [x] Rive CSS 类名和日志引用全部清理
- [x] CLAUDE.md 更新为 Live2D 架构描述（No Rive references remaining）
- [x] vite build 编译通过（无 Rive 引用残留）

## Deviations
None — plan executed as written.

## 项目当前状态
Live2D 迁移完成。所有 Rive 代码已移除，CLAUDE.md 反映 Live2D 架构。
遗留项：Rust 后端 `commands/models.rs` 中仍有 `.riv` 引用（不在本次修改范围内）。
