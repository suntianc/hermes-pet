# Requirements: Hermes DeskPet — Milestone 3

**Defined:** 2026-05-11
**Core Value:** 宠物通过生动的动画和语音反馈，让用户感知 AI Agent 的实时工作状态

## Milestone v3.0 Requirements

### Live2D Core Rendering

- [x] **L2D-01**: 集成 Live2D Cubism 5 WebGL SDK，在 Tauri WebView 中渲染 .moc3 模型
- [x] **L2D-02**: 创建 Live2DRenderer 实现 PetRenderer 接口（loadModel, playAction, setSpeaking, lookAt, resize, destroy）
- [x] **L2D-03**: 动作映射系统 — 将 10 种动作状态映射到 Live2D Motion 组（无对应时自动 fallback）

### Animation & Interaction

- [x] **L2D-04**: TTS 唇形同步 — 通过 mouthOpen 参数驱动嘴部动画，基于 RMS 振幅值
- [x] **L2D-05**: 鼠标跟随 — 通过 ParamAngleX/ParamAngleY 或自定义参数实现
- [x] **L2D-06**: 空闲动画 — 呼吸 + 眨眼自动循环，400ms 空闲返回 idle

### Model Management

- [x] **L2D-07**: 模型导入系统适配 .moc3 + .model3.json 文件（替代 .riv 导入流程）
- [x] **L2D-08**: 模型注册表 models.json 更新为 Live2D 格式，支持内建 + 用户导入模型

### Cleanup

- [x] **L2D-09**: 移除 @rive-app/canvas 依赖和相关代码（RiveRenderer, rive-inputs.ts 等）
- [x] **L2D-10**: 移除 .riv 文件导入和相关模型管理代码
- [x] **L2D-11**: 更新 CLAUDE.md 和文档反映 Live2D 架构

## v2 Requirements (Future)

### AI Agent 业务功能
- **FUNC-01**: AI Agent 状态面板（查看当前 Agent 阶段、耗时、决策链路）
- **FUNC-02**: 系统监控面板（CPU/内存使用率等）

## Out of Scope

| Feature | Reason |
|---------|--------|
| 多渲染引擎并行 | 全量替换为 Live2D，保持单一引擎 |
| Web 版本 | 桌面应用，不计划 Web 部署 |
| 移动端 | 不计划 iOS/Android 版本 |
| 实时语音对话 | TTS 为单向播报，不含对话管理 |
| AI Agent 业务功能 | 先完成渲染引擎替换 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| L2D-01 | Phase 1 | ✅ Complete |
| L2D-02 | Phase 1 | ✅ Complete |
| L2D-03 | Phase 1 | ✅ Complete |
| L2D-04 | Phase 2 | ✅ Complete |
| L2D-05 | Phase 2 | ✅ Complete |
| L2D-06 | Phase 2 | ✅ Complete |
| L2D-07 | Phase 3 | ✅ Complete |
| L2D-08 | Phase 3 | ✅ Complete |
| L2D-09 | Phase 4 | ✅ Complete |
| L2D-10 | Phase 4 | ✅ Complete |
| L2D-11 | Phase 4 | ✅ Complete |

**Coverage:**
- v3.0 requirements: 11 total
- Mapped to phases: 11
- Unmapped: 0 ✓

---
*Requirements defined: 2026-05-11*
*Last updated: 2026-05-12 after roadmap creation*
