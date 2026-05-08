# Phase 1: Rive Rendering Pipeline — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-08
**Phase:** 1-Rive Rendering Pipeline
**Areas discussed:** Rive 运行时选择, 模型加载方式, State Machine 输入设计, Canvas 渲染策略

---

## Rive 运行时选择

| Option | Description | Selected |
|--------|-------------|----------|
| @rive-app/canvas | Canvas2D 渲染器，包极小(~150KB)，适合矢量角色动画，零依赖 | ✓ |
| @rive-app/webgl2 | WebGL2 渲染器，支持网格变形/复杂光栅效果，包较大 | |
| @rive-app/react-canvas | React 封装层，可直接用 \<Rive\> 组件，但 PetStage 手管 canvas | |

**User's choice:** 用户使用 Rive Editor 的拆图骨骼动画工作流（PNG 组件图层 + 骨骼绑定），确认无需 WebGL 网格变形。`@rive-app/canvas` 完全满足。

**Notes:** 用户提到"逐步引入更多的动画来丰富表现"，未来可能会有背景动画等扩展需求——多层 canvas 架构已为此预留。

---

## 模型加载方式

| Option | Description | Selected |
|--------|-------------|----------|
| vivipet-assets:// | 用现有自定义协议加载 .riv 文件 | |
| Vite public/ 目录 | 通过 Vite publicDir 暴露 | |
| fetch + ArrayBuffer | fetch 后转 ArrayBuffer 传给 Rive 构造函数 | ✓ |

**User's choice:** 组合方案。内置模型用 Vite public + fetch ArrayBuffer，用户导入模型用 vivipet-assets + fetch ArrayBuffer。

**Notes:** `new Rive({ buffer })` 在 Electron 沙箱中最可靠，不受 URL 协议限制。

---

## State Machine 输入设计

| Option | Description | Selected |
|--------|-------------|----------|
| String input | 一个 string 输入 state 控制所有状态切换 | |
| Per-state triggers | 每个状态一个独立 trigger | |
| Hybrid: string + triggers | 主状态用 string，辅助动画用 trigger | ✓ |

**User's choice:** You decide → agent 选择了 Hybrid 方案。

**Notes:** string `state` 输入映射事件系统 action name（idle/thinking/speaking 等），辅助 `blink`/`breathe` trigger 处理循环动画。Phase 2 追加 `mouth_open`、`look_x`/`look_y` 等 number 输入。

---

## Canvas 渲染策略

| Option | Description | Selected |
|--------|-------------|----------|
| 复用现有 canvas | Rive 直接在 PetStage 的 canvas 上渲染 | |
| 多层 canvas | PetStage 内嵌多个 canvas 层（角色层 + 背景层等） | ✓ |
| 独立 canvas 叠加 | 独立 DOM canvas 叠加在其他内容之上 | |

**User's choice:** 直接多层 canvas，一步到位。

**Notes:** 用户计划后续加背景动画，选择多层 canvas 架构预留扩展空间。角色层 60fps，背景层可独立帧率控制。

---

## the agent's Discretion

- SM 输入名称的具体命名可在实现时微调
- 背景 canvas 的具体帧率和动画调度策略由实施决定
- RiveRenderer 的 `setSpeaking()` 方法做空壳返回（嘴型同步 Phase 2 实现）

## Deferred Ideas

- event → SM 输入映射 (SYNC-01) — Phase 2
- TTS 嘴型同步 (SYNC-02) — Phase 2
- 鼠标跟随 (SYNC-03) — Phase 2
- Live2D 代码清理 (CLEAN-01~07) — Phase 3
- 模型注册表适配 (MODEL-01~05) — Phase 4
