---
phase: 02-animation-event-integration
plan: 02
subsystem: animation
tags: [rive, lip-sync, mouse-follow, rAF-loop, tts-amplitude]

# Dependency graph
requires:
  - phase: 02-01
    provides: SM input caching (stateInput, mouthOpenInput, lookXInput, lookYInput), action interrupts, idle timer
provides:
  - TTS 嘴型同步（SYNC-02）：mouth_open SM 输入跟随 RMS 振幅，0.05 削波 + 0.02 迟滞防止抖动
  - 鼠标跟随（SYNC-03）：look_x/look_y SM 输入 lerp(0.1) 平滑追踪 + canvas 像素→ -1.0~1.0 归一化
  - rAF 渲染循环：每帧调用 updateMouseFollow() + updateLipSync()，onLoad 启动 / destroy 停止
affects: [next-phase: 03-tts-integration (TTS 管道完整对接)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - 振幅平滑：指数移动平均（AMP_LERP_FACTOR=0.2）防止嘴型突变
    - 削波迟滞：开口阈值 0.05、闭口阈值 0.03（AMP_HYSTERESIS=0.02）
    - 鼠标 lerp 平滑：LOOK_LERP_FACTOR=0.1 指数插值
    - rAF 输入更新循环：独立于 Rive 内部渲染循环，仅更新 SM 输入值
    - Delta 守卫：mouth 变化 >0.005 或 look 变化 >0.001 时才写入 SM 输入

key-files:
  created: []
  modified:
    - apps/desktop/src/features/pet/RiveRenderer.ts

key-decisions:
  - "D-06: setSpeaking() 直接设置 mouth_open number 输入值"
  - "D-07: 振幅削波阈值 0.05 — 低于此值的 RMS 忽略，保持嘴巴闭合"
  - "D-08: mouth_open 范围 0.0~1.0，RMS 直接透传不缩放"
  - "D-09: RiveRenderer 端 lerp(0.1) 平滑 — 在 rAF 循环中 current += (target - current) * factor"
  - "D-10: PetStage 保持 setInterval(50ms) 发送原始坐标，与平滑解耦"
  - "D-11: lookAt() 内部将 canvas 像素坐标归一化为 -1.0~1.0 SM 空间"
  - "D-17: mouth_open 值变化时 console.log 调试"

requirements-completed: [SYNC-02, SYNC-03]

# Metrics
duration: 12min
completed: 2026-05-08
---

# Phase 2 Plan 02: TTS Lip Sync + Mouse Follow + rAF Loop Summary

**Rive SM 输入平滑系统完整实现：TTS 嘴型同步（RMS 振幅→mouth_open）、鼠标视线跟随（canvas 像素→look_x/look_y lerp）、rAF 渲染循环整合**

## Performance

- **Duration:** 12 min
- **Started:** 2026-05-08T07:50:00Z
- **Completed:** 2026-05-08T08:02:00Z
- **Tasks:** 3/3
- **Files modified:** 1 (`RiveRenderer.ts`, +122/-4 lines, total 372 lines)

## Accomplishments

1. **TTS 嘴型同步（SYNC-02）:** 8 个字段（isSpeaking, currentAmplitude, targetAmplitude, lastMouthValue, AMPLITUDE_CLAMP=0.05, AMP_LERP_FACTOR=0.2, mouthCurrentlyOpen, AMP_HYSTERESIS=0.02）+ `setSpeaking()` + `updateLipSync()` 方法。振幅削波（<0.05 忽略）、指数移动平均平滑、迟滞带（开口 0.05 / 闭口 0.03）防止阈值抖动
2. **鼠标跟随（SYNC-03）:** 7 个字段（targetLookX/Y, currentLookX/Y, lastLookX/Y, LOOK_LERP_FACTOR=0.1）+ `lookAt()` + `resetPointer()` + `updateMouseFollow()` 方法。画布像素坐标归一化 -1.0~1.0、lerp 平滑插值、delta 守卫（>0.001 写入，避免冗余 WASM 调用）
3. **rAF 渲染循环:** `startRenderLoop()` / `stopRenderLoop()` 方法、`rafId` 字段。`onLoad` 完成后自动启动，`destroy()` 中先停止循环再清理。每帧按序调用 `updateMouseFollow()` → `updateLipSync()`

## Task Commits

| # | Task | Commit Hash | Key Changes |
|---|------|-------------|-------------|
| 1 | TTS 嘴型同步 — setSpeaking() + 振幅平滑 | `308381c` | +56 lines: 字段声明、setSpeaking 实现、updateLipSync 迟滞削波 |
| 2 | 鼠标跟随 — lookAt() + resetPointer() + 坐标归一化 | `6b5fb01` | +41 lines: 字段声明、lookAt 归一化、resetPointer、updateMouseFollow lerp |
| 3 | rAF 渲染循环 — 整合 lerp 更新 + lip sync | `0e0bdcf` | +25 lines: startRenderLoop/stopRenderLoop、onLoad 启动、destroy 停止 |

## Files Modified

- `apps/desktop/src/features/pet/RiveRenderer.ts` — 从 250 行扩展到 372 行，添加完整的 TTS 嘴型同步、鼠标跟随、rAF 渲染循环系统

## Decisions Made

遵循 Phase 2 CONTEXT.md 的锁定的决策：
- **D-06/07/08:** `setSpeaking()` 直接设置 mouth_open，0.05 削波，0.0~1.0 直接透传
- **D-09:** Renderer 端 lerp(0.1) 平滑（与 PetStage 50ms 坐标发送解耦）
- **D-10:** PetStage setInterval(50ms) 不变，平滑逻辑在 RiveRenderer 内部
- **D-11:** `lookAt()` 内部归一化 canvas 像素 → -1.0~1.0
- **D-17:** `mouth_open` 值变化时记录 `[RiveRenderer] mouth_open → N.NNN` 调试日志

## Deviations from Plan

None — plan executed exactly as written. All three tasks implemented per specification with all acceptance criteria passing.

### TDD Compliance

Tasks marked `tdd="true"` with manual verification per D-16 (no test framework installed). Verification performed via grep pattern matching (24/24 criteria) + TypeScript compilation (no errors). No test infrastructure exists in the project — consistent with prior wave approach.

## Issues Encountered

- `npx` not available on PATH — used `npm run build:main` (which wraps `tsc -p tsconfig.main.json`) via nvm node v22.22.2

## Threat Flags

None — no new network endpoints, auth paths, file access patterns, or schema changes introduced. All inputs are same-process (mouse coordinates from PetStage, RMS amplitude from StreamingAudioPlayer). Consistent with plan's threat model.

## Next Phase Readiness

- Phase 2 animation fundamentals complete:
  - SM 输入缓存（02-01）
  - 动作中断 + idle 自动返回（02-01）
  - TTS 嘴型同步（02-02）✅
  - 鼠标视线跟随（02-02）✅
  - rAF 输入平滑循环（02-02）✅
- Next: Phase 3 TTS Integration — 对接 TTS 管道到 rAF 循环，确认完整端到端数据流

---

*Phase: 02-animation-event-integration*
*Plan: 02*
*Completed: 2026-05-08*
