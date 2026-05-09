# Hermes DeskPet (ViviPet)

## What This Is

一款 AI 驱动的桌面宠物伴侣应用，运行在 macOS/Windows/Linux 上。宠物会根据 AI Agent 的工作状态做出实时反应（思考时沉思、编码时敲键盘、成功时开心等），并通过 TTS 语音或文字气泡与用户交流。使用 Rive 引擎渲染，Tauri 2 + Rust 为桌面后端框架。

## Core Value

宠物通过生动的动画和语音反馈，让用户感知 AI Agent 的实时工作状态，将抽象的计算过程转化为可观察、有情感的陪伴体验。

## Requirements

### Validated

从已完成 Milestone 1（Live2D → Rive 迁移）交付的能力：

- ✓ **Rive 渲染管线** — RiveRenderer + 多 canvas 架构，@rive-app/canvas 驱动
- ✓ **状态机驱动动画** — 10 种动作状态（idle/thinking/speaking/happy/error/searching/coding/terminal/confused/angry）
- ✓ **TTS 唇形同步** — mouth_open 数值输入驱动嘴部动画，RMS 振幅平滑 + 迟滞削波
- ✓ **鼠标跟随** — look_x/look_y 数值输入，50ms 轮询
- ✓ **空闲自动返回** — 瞬间动作 400ms 后自动回到 idle
- ✓ **TTS 引擎** — 三提供商（system/local/cloud），队列管理，长文本分段
- ✓ **StreamingAudioPlayer** — Web Audio API 播放，实时 RMS 振幅分析
- ✓ **HTTP Adapter** — 端口 18765 接受外部 Agent 事件
- ✓ **AI 行为规划器** — OpenAI function calling（rule/ai/hybrid 三模式）
- ✓ **事件驱动行为系统** — Agent phase → 宠物动作映射
- ✓ **Speech Bubble** — 文字气泡（计时/tts-sync 两种模式）
- ✓ **系统托盘** — 显示/隐藏、尺寸、鼠标穿透/跟随、模型切换、TTS 配置
- ✓ **模型管理系统** — .riv 导入/扫描、用户模型合并
- ✓ **窗口管理** — 无边框透明置顶，右下角锚定

### Active

目标: Electron → Tauri 2 + Rust 全线迁移。所有 backend 逻辑从 Node.js/Electron 重写为 Rust/Tauri commands。

- [ ] **TAURI-01**: 初始化 Tauri 2 项目，配置跨平台构建（macOS/Win/Linux）
- [ ] **TAURI-02**: 窗口管理迁移（无边框透明、置顶、锚定右下角、拖拽/缩放）
- [ ] **TAURI-03**: Rust backend 重写：TTS 引擎（system/local/cloud 三 provider）
- [ ] **TAURI-04**: Rust backend 重写：HTTP Adapter（端口 18765，axum/actix-web）
- [ ] **TAURI-05**: Rust backend 重写：AI Planner（OpenAI API via reqwest）
- [ ] **TAURI-06**: Rust backend 重写：系统托盘（tauri-plugin-system-tray）
- [ ] **TAURI-07**: Rust backend 重写：模型管理（导入、扫描、注册，tauri-plugin-fs）
- [ ] **TAURI-08**: 前端 IPC 适配：所有 window.electronAPI → @tauri-apps/api invoke/events
- [ ] **TAURI-09**: TTS 音频流传输适配（Rust streaming → Web Audio API）
- [ ] **TAURI-10**: 日志系统：Rust tracing 替代 electron-log
- [ ] **TAURI-11**: 自动更新：tauri-plugin-updater 替代 electron-updater
- [ ] **TAURI-12**: 跨平台构建验证（macOS .dmg + Windows .msi + Linux .AppImage）
- [ ] **TAURI-13**: 深度系统监控基础设施（Rust sysinfo 或类似 crate，具体指标后续确定）
- [ ] **TAURI-14**: 移除全部 Electron/Node.js 依赖和代码

### Out of Scope

- **多角色同屏** — 当前只显示一个宠物角色
- **Web 版本** — 桌面应用，不计划 Web 部署
- **移动端** — 不计划 iOS/Android 版本
- **实时语音对话** — TTS 为单向播报，不包含语音识别和对话轮次管理
- **AI Agent 业务逻辑** — 迁移的是框架，业务监控指标在迁移后规划

## Context

当前项目为一个可运行的 Electron 41 + React 19 + Vite 5 + TypeScript 5.5 应用。Milestone 1 已完成 Live2D → Rive 迁移，渲染层（RiveRenderer + PetStage + StreamingAudioPlayer + SpeechBubble + PetStore）为纯前端代码，在 WebView 中运行，Tauri 迁移后无需改动。

所有 Electron 主进程代码（`electron/` 目录约 15 个文件）需要重写为 Rust，包括：

| 当前模块 | Rust 替代 |
|---------|-----------|
| electron/ipc.ts | Tauri commands + @tauri-apps/api invoke |
| electron/preload.ts | 删除（Tauri 无需 preload） |
| electron/window.ts | tauri.conf.json 配置 + Rust 窗口 API |
| electron/tray.ts | tauri-plugin-system-tray |
| electron/main.ts | Tauri setup 入口 |
| electron/tts/tts-manager.ts | Rust TTS module + std::process::Command |
| electron/tts/streamers/*.ts | Rust + reqwest 直调云端 TTS API |
| electron/adapter/server.ts | Rust axum HTTP server |
| electron/ai-planner.ts | Rust reqwest → OpenAI API |
| electron/model-manager.ts | Rust + tauri-plugin-fs + tauri dialog |
| electron/app-state.ts | Rust 全局状态 |
| electron/action-index.ts | Rust 文件/目录扫描 |

## Constraints

- **跨平台**: Tauri 2 的跨平台构建链（macOS arm64 + x64 / Windows / Linux）
- **Rust 工具链**: 项目中需要引入 Cargo.toml、rust-toolchain.toml 等 Rust 配置
- **Rive 渲染**: 保持 @rive-app/canvas 方案不变，WebView 中的 Rive + React + Vite + TypeScript 全量保留
- **TTS 跨平台**: system provider 需要对各平台实现不同方案（macOS say / Windows SAPI / Linux speech-dispatcher 或 espeak）
- **性能**: 保持 60fps 动画，Rust 开销低于当前 Node.js 主进程

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| 放弃 Electron 转向 Tauri 2 + Rust | 更低内存占用，深度系统监控能力，跨平台一致性 | — Pending |
| 全部 Rust 替代 Node.js | 零 Node.js 依赖，纯净 Rust 后端 | ✓ 决定 |
| TTS Rust 重写（跨平台实现） | 彻底告别系统命令依赖，各平台原生调用 | ✓ 决定 |
| AI Planner 迁至 Rust (reqwest) | 统一后端技术栈，避免双语言维护 | ✓ 决定 |
| 日志 tracing 替代 electron-log | Rust 生态标准方案 | ✓ 决定 |
| 渲染层（Rive/React）保持不动 | 纯 WebView 代码，Tauri 兼容 | ✓ 决定 |
| 深度监控在迁移后规划具体指标 | 先搭框架，后定具体监控项 | ✓ 决定 |
| 跨平台目标（macOS/Win/Linux） | 扩大用户覆盖 | ✓ 决定 |

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
*Last updated: 2026-05-09 after Milestone 2 initialization*
