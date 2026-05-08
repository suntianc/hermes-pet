# Hermes DeskPet (ViviPet)

## What This Is

一款 AI 驱动的桌面宠物伴侣应用，运行在 macOS/Windows/Linux 上。宠物会根据 AI Agent 的工作状态做出实时反应（思考时沉思、编码时敲键盘、成功时开心等），并通过 TTS 语音或文字气泡与用户交流。当前使用 Live2D Cubism 5 渲染，正在迁移到 Rive 引擎。

## Core Value

宠物通过生动的动画和语音反馈，让用户感知 AI Agent 的实时工作状态，将抽象的计算过程转化为可观察、有情感的陪伴体验。

## Requirements

### Validated

从现有代码库推导的能力：

- ✓ **Electron 双进程架构** — 安全沙箱化的主进程+渲染器分离
- ✓ **Live2D Cubism 5 渲染** — WebGL 加载 .moc3 模型、纹理、物理、动作播放
- ✓ **TTS 语音播报** — 三提供商（macOS say / 本地服务 / 云端 API），队列管理，流式播放
- ✓ **Text-to-Speech 管道** — 长文本分段、IPC 音频块传输、Web Audio API 播放、RMS 振幅分析
- ✓ **AI 行为规划器** — OpenAI function calling 驱动(rule/ai/hybrid 三模式)
- ✓ **HTTP Adapter** — 端口 18765 接受外部 Agent 事件（支持 Hermes Agent 集成）
- ✓ **事件驱动行为系统** — Agent phase → 宠物动作映射、会话管理、事件聚合
- ✓ **系统托盘菜单** — 显示/隐藏、尺寸调节、鼠标穿透/跟随、模型切换、TTS 配置
- ✓ **Speech Bubble** — 文字气泡显示（计时/tts-sync 两种模式）
- ✓ **模型管理系统** — .zip 导入、SQLite 动作索引、vivipet-assets:// 自定义协议
- ✓ **AI Planner 设置面板** — 渲染器端的 AI 配置 UI
- ✓ **鼠标交互** — 点击、双击、拖拽、鼠标跟随

### Active

- [ ] **RIVE-01**: 移除所有 Live2D 相关代码（Cubism SDK WASM、Framework 源码、Shader 文件、模型文件）
- [ ] **RIVE-02**: 集成 Rive 渲染引擎（@rive-app/canvas 或 @rive-app/webgl）
- [ ] **RIVE-03**: 创建 RiveRenderer 替代 Live2DRenderer，实现 PetRenderer 接口
- [ ] **RIVE-04**: 重构 PetStage 渲染生命周期（加载 .riv → 播放 Animation → 状态机驱动）
- [ ] **RIVE-05**: 支持 Rive State Machine 标准状态切换（idle/thinking/speaking/happy/error 等）
- [ ] **RIVE-06**: TTS 嘴型同步适配（动画触发参数映射）
- [ ] **RIVE-07**: 模型导入系统适配 .riv 文件（替代 .zip/.moc3 导入流程）
- [ ] **RIVE-08**: 移除模型动作索引 SQLite 模块（Rive 动画自动包含在 .riv 中）
- [ ] **RIVE-09**: 提供 Rive 集成 API 和示例代码，支持后续自定义 .riv 文件接入

### Out of Scope

- **多角色同屏** — 当前只显示一个宠物角色
- **Web 版本** — Electron 桌面应用，不计划 Web 部署
- **移动端** — 不计划 iOS/Android 版本
- **实时语音对话** — TTS 为单向播报，不包含语音识别和对话轮次管理

## Context

代码库是一个已可运行的 Electron 41 应用，使用 React 19 + Vite 5 + TypeScript 5.5。当前渲染引擎为 Live2D Cubism 5（WebGL），相关代码分布在：

- `src/vendor/cubism/` — 约 200+ 文件的 Cubism 5 Framework SDK
- `public/live2dcubismcore.js` — Cubism Core WASM
- `public/Framework/Shaders/WebGL/` — WebGL shader 文件
- `public/models/` — 内建 Live2D 模型文件（.model3.json, .moc3, motion 文件）
- `src/features/pet/Live2DRenderer.ts` — Cubism 5 WebGL 渲染器实现
- `src/features/pet/PetRenderer.ts` — 渲染器抽象接口
- `src/features/pet/capability-resolver.ts` — 动作命名→动画组映射
- `electron/action-index.ts` — SQLite 动作索引
- `electron/model-manager.ts` — 模型导入和协议处理

Rive 替换后，上述文件将大幅减少或移除，渲染层由 Rive 的运行时接管。

## Constraints

- **Electron 41**: 渲染器运行在 Chromium 沙箱中，Rive 运行时需兼容
- **macOS primary**: 开发环境为 macOS，需确保 Windows/Linux 编译
- **Rive 运行时**: 使用 `@rive-app/canvas`（轻量级，适用于 2D 矢量动画），需要评估 WebGL 兼容性
- **性能**: 宠物动画需保持 60fps，Rive 渲染开销需低于 Live2D Cubism

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| 放弃 Live2D 转向 Rive | 更轻量的运行时、矢量动画、状态机原生支持、简化代码库 | — Pending |
| 标准状态驱动动画 | 与现有事件系统兼容，从 agent phase 直接映射到 Rive state machine | — Pending |
| Rive .riv 文件由用户提供 | 建好集成架构后用户自定义动画资源 | — Pending |
| 保留所有现有功能 | 只替换渲染引擎，行为逻辑/AI/TTS/Adapter 不动 | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-05-08 after initialization*
