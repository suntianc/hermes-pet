---
phase: 03-model-management
plan: 01
type: execute
subsystem: model-management
tags: [live2d, model-registry, models-json, L2D-07, L2D-08]
requires: [01-live2d-core]
affects: [04-cleanup]
tech-stack:
  added: []
  patterns: [ModelType union, Live2DMetadata interface]
key-files:
  created: []
  modified:
    - apps/desktop/src/features/pet/model-registry.ts
    - apps/desktop/src/tauri-types.ts
    - apps/desktop/public/assets/models/models.json
decisions:
  - "ModelType 扩展为 'rive' | 'live2d' 联合类型，向后兼容"
  - "Live2DMetadata 作为可选字段，运行时从 .model3.json 自动解析而非硬编码"
  - "User model mapping 现在正确传递 type 字段到 ModelConfig"
metrics:
  duration: "~5 min"
  completed_date: "2026-05-12"
---

# Phase 3 Plan 01: .moc3 模型格式适配

**One-liner:** 模型配置系统从 Rive (.riv) 扩展为同时支持 Live2D (.moc3/.model3.json) 格式 — ModelType 联合类型、Live2DMetadata 接口、models.json Live2D 格式示例。

## Tasks Executed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Update ModelType & ModelConfig for Live2D | `9bd5ece` | model-registry.ts, tauri-types.ts |
| 2 | Update models.json with Live2D format | `b10920d` | models.json |

## Key Changes

### 1. ModelType 联合类型
- 从 `type ModelType = 'rive'` → `type ModelType = 'rive' | 'live2d'`
- 向后兼容：现有 Rive 模型继续使用 `type: 'rive'`

### 2. Live2DMetadata 接口
```typescript
export interface Live2DMetadata {
  motions?: string[];
  expressions?: string[];
  physics?: string;
  pose?: string;
  displayInfo?: { width: number; height: number; xOrigin: number; yOrigin: number };
}
```
- 可选字段，存储在 ModelConfig.live2d 中
- 运行时从 .model3.json 自动解析（Live2DRenderer 已在 loadModel 中解析）

### 3. User model type 传递
- 修复了 `loadModelConfigs` 中 DTO → ModelConfig 映射没有传递 `type` 字段的问题

### 4. models.json Live2D 格式
- 空数组 → 包含 Haru 和 Mao 两个 Live2D 模型示例条目
- `type: "live2d"`, `path` 指向 `.model3.json` 文件

## Verification

TypeScript 编译检查：无新增错误（仅预存的 Cubism SDK 严格类型警告和 Tauri updater 事件类型错误）

## Success Criteria Check
- [x] ModelType 为 'rive' | 'live2d' 联合类型
- [x] ModelConfig 包含 Live2DMetadata 可选字段
- [x] models.json 包含 Live2D 格式示例条目
- [x] tauri-types.ts ModelConfigDTO type 注释已更新
- [x] 前端类型检查通过（无新增错误）

## Deviations
None — plan executed as written.
