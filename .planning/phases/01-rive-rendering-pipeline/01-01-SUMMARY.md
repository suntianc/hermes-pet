# Plan 01-01: Rive Runtime Foundation — Summary

**Completed:** 2026-05-08
**Files modified:** 4 created, 2 modified
**Requirements:** RIVE-01, RIVE-02, RIVE-05, RIVE-07

## Deliverables

1. **`@rive-app/canvas` v2.37.5** 安装到 `apps/desktop/package.json`
2. **`RiveRenderer.ts`** — 完整实现 `PetRenderer` 接口，支持：
   - `loadModel()`: 通过 fetch + ArrayBuffer 加载 .riv 文件，创建角色 canvas + 背景 canvas
   - `playAction()`: 通过 Rive v2 API (`stateMachineInputs` + `fire()`/`value`) 驱动 State Machine
   - `resize()`: 正确处理 `devicePixelRatio`
   - `destroy()`: 调用 `rive.cleanup()` 防止内存泄漏
3. **`rive-inputs.ts`** — `RIVE_INPUTS` 常量 + `RiveStateValue` 类型 + `RIVE_STATES` 列表
4. **`main.tsx`** — Rive WASM 预加载（开发模式自动管理）

## Key Decisions

- 使用 Rive v2 API：`stateMachineInputs(smName)` 获取输入对象，不是 `setInputState()`
- State Machine 输入驱动方式：Trigger（每个状态一个 trigger）或 Number（`state` 输入映射到数字索引）
- `StateMachineInputType` 正确分区处理：Trigger → `fire()`，Number → `value = n`，Boolean → `value = true`

## TypeScript Verification

- `RiveRenderer.ts` 和 `rive-inputs.ts` — 编译通过 ✅
- 预存的 Live2D Cubism 错误（~40 个）保持不变，Phase 3 清理

## What's Next

Plan 01-02 将重构 PetStage 以使用 RiveRenderer，建立多层 canvas 架构。
