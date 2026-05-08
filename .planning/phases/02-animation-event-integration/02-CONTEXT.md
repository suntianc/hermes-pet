# Phase 2: Animation/Event Integration — Context

**Gathered:** 2026-05-08
**Status:** Ready for planning

<domain>
## Phase Boundary

将事件系统（Adapter events）、TTS 嘴型同步（RMS amplitude → mouth_open）、鼠标跟随与 Rive State Machine 对接。利用 Phase 1 已建立的 SM 输入体系（state/mouth_open/look_x/look_y）来实现实时动画驱动。

**Requirements:** SYNC-01, SYNC-02, SYNC-03, SYNC-04, SYNC-05

</domain>

<decisions>
## Implementation Decisions

### Idle 自动返回机制（SYNC-04）
- **D-01:** Hybrid 方案 — RiveRenderer 内部维护 idle 定时器 + 外部 App.tsx 的 scheduleIdle() 双重保障
- **D-02:** 瞬间动作（error/happy/clicked/doubleClicked 等）播完后，RiveRenderer 自动在 `playAction()` 后设定定时器将 `state` 输入重置为 idle(0)
- **D-03:** 持续动作（thinking/speaking 等）必须由外部事件显式触发 idle 切换才退出
- **D-04:** RiveRenderer 公开 `scheduleIdle(delay)` 方法供外部调用覆盖默认定时

### TTS 嘴型同步（SYNC-02）
- **D-05:** 通过 PetStage useEffect 轮询更新 — PetStore 的 `ttsAmplitude` 已由 `StreamingAudioPlayer` → `App.tsx` 管道持续更新
- **D-06:** `RiveRenderer.setSpeaking(speaking, amplitude)` 内部直接设置 `mouth_open` number 输入值
- **D-07:** 振幅削波：低于 0.05 的 RMS 值忽略（保持嘴巴闭合），避免噪音导致微小抖动
- **D-08:** `mouth_open` 值范围 0.0–1.0，不做额外缩放，直接透传 RMS

### 鼠标跟随平滑（SYNC-03）
- **D-09:** RiveRenderer 端做 lerp（线性插值）平滑 — `look_x`/`look_y` 目标值来自 PetStage，RiveRenderer 在 `requestAnimationFrame` 更新循环中做 `lerp(current, target, 0.1)`
- **D-10:** PetStage 继续用现有 setInterval(50ms) 发送原始坐标，平滑逻辑与输入获取解耦
- **D-11:** `lookAt(x, y)` 的坐标归一化为 -1.0~1.0（Rive SM 期望的输入范围），PetStage 传入的画布像素坐标在 RiveRenderer 内转换

### 动作打断策略（SYNC-05）
- **D-12:** 立即打断 — `playAction()` 直接设置 `state` number input，Rive SM 立即触发 transition
- **D-13:** 不维护动作队列 — 每次 `playAction()` 覆盖当前 `state` 值
- **D-14:** 动作完成后回到 idle 由定时器（D-01/D-02）或外部事件（D-03）决定

### 状态命名约定
- **D-15:** Rive Editor 中 SM 输入名称必须与 `rive-inputs.ts` 常量精确匹配
  - `state`: number (0=idle, 1=thinking, 2=speaking, 3=happy, 4=error, 5=searching, 6=coding, 7=terminal, 8=confused, 9=angry)
  - `mouth_open`: number (0.0–1.0)
  - `look_x` / `look_y`: number (-1.0–1.0)
  - `blink` / `breathe`: trigger

### 测试策略
- **D-16:** 手动验证为主 — 嘴型同步可视、鼠标跟随可观察、动作映射通过触发不同 Agent event 验证
- **D-17:** 控制台日志记录 `state` 输入变化和 `mouth_open` 值用于调试

### the agent's Discretion
- lerp 平滑系数（默认 0.1）可在实现时微调以达到最佳视觉效果
- 削波阈值（默认 0.05）可根据实际音频特性调整
- idle 自动返回延迟时间（momentary action 默认值）由实施决定，参考现有 `scheduleIdle()` 的 300-500ms
- `setRiveStateInputs()` 的输入查询缓存在高频更新场景下是否需要优化由实施决定

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project context
- `.planning/PROJECT.md` — 项目目标、核心价值、需求分类
- `.planning/REQUIREMENTS.md` — v1 需求（SYNC-01~05 为 Phase 2）
- `.planning/ROADMAP.md` — 4 阶段路标和验证标准

### Phase 1 decisions (direct dependency)
- `.planning/phases/01-rive-rendering-pipeline/01-CONTEXT.md` — D-13~D-17 定义 SM 输入体系，D-47 setSpeaking 空壳需实现

### Architecture & Integrations
- `apps/desktop/src/features/pet/RiveRenderer.ts` — 目标实现文件，setSpeaking/lookAt 待实现
- `apps/desktop/src/features/pet/PetRenderer.ts` — 渲染器接口定义
- `apps/desktop/src/features/pet/rive-inputs.ts` — SM 输入名称常量（Phase 1 定义）
- `apps/desktop/src/components/PetStage.tsx` — 调用方，已含有 setSpeaking/lookAt 调用点
- `apps/desktop/src/stores/pet-store.ts` — TTS 状态和 amplitude 管道
- `apps/desktop/src/audio/streaming-player.ts` — RMS 振幅分析源
- `apps/desktop/src/App.tsx` — 事件路由和 scheduleIdle 逻辑
- `.planning/codebase/ARCHITECTURE.md` §Event Pipeline — 事件→renderer 数据流
- `.planning/codebase/INTEGRATIONS.md` — TTS 管道和 Adapter 事件 schema

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `RiveRenderer.ts` — `setSpeaking()`, `lookAt()`, `setRiveStateInputs()` 方法骨架已存在
- `PetStage.tsx:263-271` — 已监听 `isSpeaking` + `ttsAmplitude` 并调用 `renderer.setSpeaking()`
- `PetStage.tsx:226-261` — 已实现鼠标跟随、坐标计算和 `renderer.lookAt()` 调用
- `App.tsx:126-133` — `scheduleIdle()` 定时器逻辑可直接复用

### Established Patterns
- `actionRevision` + `useEffect` 驱动动作播放 — PetStage 通过 revision 变化触发 playAction
- `PetStore` observer 模式 — state 变化自动通知所有订阅者
- `data-*` attribute（`mouseFollow`, `resetPointer`）跨组件通信模式

### Integration Points
- `RiveRenderer.setSpeaking()` → 通过 `StateMachineInput.value` 设置 `mouth_open`
- `RiveRenderer.lookAt()` → 通过 `StateMachineInput.value` 设置 `look_x`/`look_y`
- `App.tsx:scheduleIdle()` → 动作完成后调用 `playAction('idle')` 回到 idle
- `RiveRenderer.playAction()` → 当前已实现 state number 映射，momentary 动作后需触发 idle 定时

### Rive SM 输入操作模式
- `rive.stateMachineInputs(smName)` 返回 input 数组
- **Number 输入**: `const input = inputs.find(i => i.name === 'mouth_open'); if (input) { (input as StateMachineInput).value = 0.5; }`
- **Trigger 输入**: `const input = inputs.find(i => i.name === 'blink'); if (input) { input.fire(); }`
- 输入查询在每秒 20+ 次更新场景下应考虑缓存结果避免 GC 压力

</code_context>

<specifics>
## Specific Ideas

- lerp 平滑可使鼠标跟随更自然：每次 rAF 更新时 `current += (target - current) * 0.1`
- 嘴型同步的削波阈值可做成可配置参数，方便调校
- 短暂动作（如 blink）可通过 trigger 输入而非 state 输入来触发，避免打断当前 state

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 2-Animation/Event Integration*
*Context gathered: 2026-05-08*
