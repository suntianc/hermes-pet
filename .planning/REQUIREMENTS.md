# Requirements: Hermes DeskPet — Milestone 2

**Defined:** 2026-05-09
**Core Value:** 宠物通过生动的动画和语音反馈，让用户感知 AI Agent 的实时工作状态

## v1 Requirements

### Foundation (Tauri 2 Scaffold + Infrastructure)

- [ ] **FND-01**: Tauri 2 项目初始化，配置 Cargo.toml、tauri.conf.json、capabilities
- [ ] **FND-02**: 窗口管理：无边框透明置顶窗口，右下角锚定，拖拽/缩放
- [ ] **FND-03**: 系统托盘：显示/隐藏、尺寸切换、鼠标穿透、TTS 开关、模型/退出
- [ ] **FND-04**: 日志系统：Rust tracing 替代 electron-log，写入文件
- [ ] **FND-05**: 单实例锁：防止多个应用实例同时运行
- [ ] **FND-06**: CI/CD 搭建：GitHub Actions 跨平台构建 (macOS/Win/Linux)

### TTS Engine

- [ ] **TTS-01**: system provider：macOS AVSpeechSynthesizer / Windows SAPI / Linux espeak-ng
- [ ] **TTS-02**: local provider：HTTP 流式 TTS 服务对接（复用现有字段映射 Text/Voice/Model/Instruct）
- [ ] **TTS-03**: cloud provider：OpenAI / ElevenLabs / Azure TTS API 对接
- [ ] **TTS-04**: TTS 队列管理：FIFO 队列，长文本分段（500 chars/chunk），状态广播
- [ ] **TTS-05**: 音频流传输：Tauri Channel 向 WebView 传输音频块，Web Audio API 播放 + RMS 振幅分析

### HTTP Adapter

- [ ] **ADP-01**: axum 嵌入式 HTTP 服务器，端口 18765，POST /adapter 和 GET /adapter/capabilities
- [ ] **ADP-02**: 服务器生命周期管理：CancellationToken 优雅关闭，与 Tauri app quit 联动

### AI Planner

- [ ] **AI-01**: reqwest 调用 OpenAI Chat Completions API，function calling 支持
- [ ] **AI-02**: 三模式运行：rule / ai / hybrid，配置持久化

### Model Management

- [ ] **MOD-01**: .riv 文件导入（tauri-plugin-dialog 文件选择器），复制到应用数据目录
- [ ] **MOD-02**: 模型目录扫描（walkdir），自动发现 .riv 文件，生成/更新 models.json

### Frontend IPC Migration

- [ ] **IPC-01**: 创建 `src/tauri-adapter.ts` 抽象层，镜像旧 `window.electronAPI` 接口
- [ ] **IPC-02**: 所有前端组件（App.tsx, PetStage, SpeechBubble, etc.）从 `window.electronAPI` 切换到 `@tauri-apps/api`
- [ ] **IPC-03**: 移除 preload.ts、全部 `window.electronAPI` 引用、electron IPC 相关类型

### Distribution

- [ ] **DST-01**: tauri-plugin-updater 集成，前端自定义更新通知 UI
- [ ] **DST-02**: macOS .dmg 构建 + 签名 + 公证
- [ ] **DST-03**: Windows .msi 构建 + 签名
- [ ] **DST-04**: Linux .AppImage 构建

### Cleanup

- [ ] **CLN-01**: 移除 Electron/Node.js 全部依赖：electron、electron-builder、electron-log、相关 package.json 条目

## v2 Requirements

### Deep System Monitoring

- **MON-01**: Rust sysinfo crate 集成，采集 CPU/内存/进程/网络等系统指标
- **MON-02**: 指标通过 Tauri events 实时推送到前端展示
- **MON-03**: 具体的监控 UI 和交互模式（后续设计）

### Post-Migration Enhancements

- **PST-01**: TTS provider native FFI 替代 std::process::Command（提升稳定性和延迟）
- **PST-02**: 前端更新通知 UI 完善（进度条、暂停/恢复）

## Out of Scope

| Feature | Reason |
|---------|--------|
| 深度系统监控指标 | 先搭框架，具体监控项在迁移完成后规划 |
| TTS native FFI | 初始阶段用 std::process::Command 足够，FFI 优化是后话 |
| 多角色同屏 | 不在此版本范围内 |
| Web 版本 | 桌面应用，不计划 Web 部署 |
| 移动端 | 不计划 iOS/Android 版本 |
| 实时语音对话 | TTS 为单向播报，不含语音识别和对话管理 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| FND-01 | Phase 1 | Pending |
| FND-02 | Phase 1 | Pending |
| FND-03 | Phase 1 | Pending |
| FND-04 | Phase 1 | Pending |
| FND-05 | Phase 1 | Pending |
| FND-06 | Phase 7 | Pending |
| TTS-01 | Phase 2 | Pending |
| TTS-02 | Phase 2 | Pending |
| TTS-03 | Phase 2 | Pending |
| TTS-04 | Phase 2 | Pending |
| TTS-05 | Phase 2 | Pending |
| ADP-01 | Phase 3 | Pending |
| ADP-02 | Phase 3 | Pending |
| AI-01 | Phase 5 | Pending |
| AI-02 | Phase 5 | Pending |
| MOD-01 | Phase 4 | Pending |
| MOD-02 | Phase 4 | Pending |
| IPC-01 | Phase 6 | Pending |
| IPC-02 | Phase 6 | Pending |
| IPC-03 | Phase 6 | Pending |
| DST-01 | Phase 7 | Pending |
| DST-02 | Phase 7 | Pending |
| DST-03 | Phase 7 | Pending |
| DST-04 | Phase 7 | Pending |
| CLN-01 | Phase 7 | Pending |

**Coverage:**
- v1 requirements: 25 total
- Mapped to phases: 25
- Unmapped: 0 ✓

---
*Requirements defined: 2026-05-09*
*Last updated: 2026-05-09 after milestone 2 initialization*
