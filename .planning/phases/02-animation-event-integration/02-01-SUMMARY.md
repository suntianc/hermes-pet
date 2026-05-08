---
phase: 02-animation-event-integration
plan: 01
subsystem: animation
tags: [rive, state-machine, sm-inputs, idle-timer, action-interrupt]

# Dependency graph
requires:
  - phase: 01-rive-rendering-pipeline
    provides: RiveRenderer class, SM input constants (rive-inputs.ts), PetRenderer interface
provides:
  - SM 输入缓存系统（cacheInputs — O(1) 缓存替代 O(n) .find()）
  - 动作中断逻辑（playAction 直接设置 stateInput，清除 pending idle 定时器）
  - Idle 自动返回定时器（momentary 动作 400ms 后自动回到 idle）
  - 调试日志基础设施（8 处 console.log 覆盖加载/缓存/动作/定时器/销毁）
affects: [next-plan: 02-02 (TTS 嘴型同步 + 鼠标跟随)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - SM 输入引用缓存模式（loadModel onLoad 时缓存 all SM inputs）
    - 动作中断 + idle 自动返回（D-12 immediate interrupt, D-02 momentary → idle timer）
    - RIVE_STATE_INDEX 映射表（string action → number index）

key-files:
  created: []
  modified:
    - apps/desktop/src/features/pet/RiveRenderer.ts

key-decisions:
  - "D-01: 使用缓存 stateInput 引用替代每次 O(n) .find() 搜索"
  - "D-02: 瞬间动作（happy/error/clicked/doubleClicked/wake）通过 400ms 定时器自动回到 idle"
  - "D-04: scheduleIdle(delay) 公开为公有方法供外部覆盖"
  - "D-12: 立即打断策略 — playAction 先 clearIdleTimer 再设置新 state"

patterns-established:
  - "SM Input 缓存模式: cacheInputs() 在 onLoad 时缓存 stateInput/mouthOpenInput/lookXInput/lookYInput"
  - "动作干预模式: clearIdleTimer() → set stateInput.value → momentary check → scheduleIdle()"
  - "状态索引映射: RIVE_STATE_INDEX Record<string, number> (idle=0..angry=9)"

requirements-completed: [SYNC-01, SYNC-04, SYNC-05]

# Metrics
duration: 5min
completed: 2026-05-08
---

# Phase 2 Plan 01: SM Input Caching + Action Interrupts + Idle Auto-Return Summary

**RiveRenderer SM 输入缓存（O(1) cached inputs）、动作打断（immediate interrupt）、idle 自动返回（momentary 400ms timer）及调试日志基础设施**

## Performance

- **Duration:** 5 min
- **Started:** 2026-05-08T07:42:39Z
- **Completed:** 2026-05-08T07:47:07Z
- **Tasks:** 3/3
- **Files modified:** 1 (`RiveRenderer.ts`, +77/-11 lines)

## Accomplishments

1. **SM 输入缓存系统:** 4 个 SM 输入（stateInput, mouthOpenInput, lookXInput, lookYInput）在 `loadModel` onLoad 时通过 `cacheInputs()` 统一缓存，消除了原 `setRiveStateInputs` 的 O(n) `.find()` 搜索（SYNC-01）
2. **动作中断 + Idle 自动返回:** `playAction()` 重写为先 `clearIdleTimer()` → 直接设置缓存 `stateInput.value` → 瞬间动作（happy/error/clicked/doubleClicked/wake）设定 400ms idle 返回定时器（SYNC-04, SYNC-05）
3. **调试日志:** 8 处 `[RiveRenderer]` 前缀日志覆盖模型加载、输入缓存、动作变化、idle 自动返回、销毁全流程（D-17）

## Task Commits

Each task was committed atomically:

1. **Task 1: SM 输入缓存系统** — `1930c2f` (feat: add SM input caching system)
2. **Task 2: 动作中断 + Idle 自动返回** — `b4af8db` (feat: implement action interruption and idle auto-return)
3. **Task 3: 调试日志基础设施** — `b67cb60` (feat: add debug logging infrastructure)

## Files Created/Modified

- `apps/desktop/src/features/pet/RiveRenderer.ts` — 从 184 行扩展到 250 行，添加缓存系统、idle 定时器、动作中断、日志基础设施

## Decisions Made

遵循 Phase 2 CONTEXT.md 的决策：
- **D-01:** Hybrid 方案 — RiveRenderer 内部维护 idle 定时器 + 外部 `scheduleIdle()` 双重保障
- **D-02:** 瞬间动作（error/happy/clicked/doubleClicked/wake）自动 400ms 返回 idle
- **D-03:** 持续动作（thinking/speaking）等待外部触发退出
- **D-04:** RiveRenderer 公开 `scheduleIdle(delay)` 方法供外部调用覆盖
- **D-12:** 立即打断 — `playAction()` 先清除 idle 定时器再设置新 state
- **D-15:** Rive_STATE_INDEX 严格匹配 rive-inputs.ts 的 0-9 编号
- **D-17:** 8 处控制台日志覆盖全流程

## Deviations from Plan

None — 计划按规范精确执行，无偏差。

### TDD 合规说明

任务标记 `tdd="true"` 但项目尚未搭建设测试框架（无 vitest/jest/test 文件，D-16 说明手动验证为主）。验证方式为 grep 模式匹配 + TypeScript 编译检查。测试基础设施将在未来阶段补充。

## Issues Encountered

- Pre-existing TypeScript 编译错误（Live2D Cubism 遗留代码）不影响本次改动。RiveRenderer.ts 自身无错误。

## User Setup Required

None — 无外部服务配置需求。

## Next Phase Readiness

- 基础架构就绪：SM 输入缓存、动作中断、idle 自动返回已完成
- 下一个 Plan（02-02）可基于已缓存的 `mouthOpenInput`/`lookXInput`/`lookYInput` 实现 TTS 嘴型同步和鼠标跟随
- `setSpeaking()` 和 `lookAt()` 方法仍在骨架状态，等待 02-02 实现

---

*Phase: 02-animation-event-integration*
*Plan: 01*
*Completed: 2026-05-08*
