---
phase: 02-animation-interaction
plan: 01-03 (combined)
subsystem: live2d-renderer
tags: [lip-sync, mouse-follow, idle-animation, cubism]
dependency_graph:
  requires: [Phase 1 - Live2D 核心渲染]
  provides: [Phase 3 - 模型管理, Phase 4 - 清理收尾]
  affects: [Live2DRenderer.ts, PetRenderer interface]
tech-stack:
  added: [CubismBreath, CubismEyeBlink]
  patterns: [EMA smoothing, hysteresis clamping, deltaTime animation loop]
key-files:
  created: [VERIFICATION.md]
  modified: [apps/desktop/src/features/pet/Live2DRenderer.ts]
decisions:
  - "Breath 和 EyeBlink 存储在 CubismUserModel._breath/_eyeBlink (protected → (any) 访问)"
  - "动画更新顺序: idle effects → lip sync → mouse follow → drawModel"
metrics:
  duration: "~15 min"
  completed_date: "2026-05-12"
  commits: 1
---

# Phase 2: 动画与交互 — Summary

所有 3 个计划作为水平层一次性实现到 Live2DRenderer.ts，为宠物添加了完整的动画交互能力：TTS 唇形同步、鼠标跟随、空闲动画。

## 交付内容

### Plan 02-01: TTS 唇形同步 (L2D-04)

- **振幅平滑:** 指数移动平均 (EMA)，lerp factor 0.2，防止 RMS 跳变
- **迟滞削波:** `< 0.05` 忽略，迟滞带 0.02，避免阈值附近微颤
- **updateLipSync():** 每帧在 drawModel() 前调用，通过 `CubismDefaultParameterId.MouthOpenY` 设置嘴部参数

### Plan 02-02: 鼠标跟随 (L2D-05)

- **坐标映射:** canvas 像素 → 归一化 -1..1，范围削波
- **参数映射:** ParamAngleX (×30°) 控制水平转头，ParamAngleY (×15°) 控制垂直
- **平滑:** lerp factor 0.1，jitter guard > 0.001 才更新

### Plan 02-03: 空闲动画 (L2D-06)

- **CubismBreath:** 三个参数 (ParamBodyAngleX, ParamBreath, ParamAngleY)，振幅 0.5，周期 3.0s，权重 0.5
- **CubismEyeBlink:** 从 modelSetting 自动读取眨眼参数，默认间隔 4s，闭眼/睁眼 0.1/0.15s
- **时间管理:** `performance.now()` 计算 delta，clamp 到 0.1s max（防止 tab 切换后跳跃）

## 验证

- `npx vite build`: ✅ PASSED (103 modules, 0 errors)
- `npx tsc --noEmit`: ✅ PASSED (0 errors in `src/`, vendor Cubism SDK 有预存 TS 严格模式警告)
- **VERIFICATION.md** 已创建：包含 3 个计划的逐条验证矩阵

## 文件变更

**Modified:** `apps/desktop/src/features/pet/Live2DRenderer.ts` (+152 / -8 行)
- 3 个新 import (CubismBreath, BreathParameterData, CubismEyeBlink)
- 新增 11 个类字段 (振幅 4 + 鼠标 6 + 时间 1)
- 重写 3 个公开方法 (setSpeaking, lookAt, resetPointer)
- 新增 4 个私有方法 (initializeIdleEffects, updateLipSync, updateMouseFollow, updateIdleEffects)
- 重写 startLoop() 动画循环

## Deviations from Plan

无 — 计划完全按预期执行。

## Self-Check

- [x] `apps/desktop/src/features/pet/Live2DRenderer.ts` — 修改确实存在 (330 行, +152/-8)
- [x] Commit `0785519` 已入历史
- [x] Vite build 通过
- [x] TypeScript 类型检查通过 (src/ 无错误)
- [x] VERIFICATION.md 已创建

## Self-Check: PASSED
