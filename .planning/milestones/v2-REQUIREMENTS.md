# Milestone 2: Tauri Migration — Archived Requirements

**Version:** v2.0
**Completed:** 2026-05-10

## v1 Requirements (All Complete)

### Foundation
- [x] **FND-01**: Tauri 2 项目初始化，配置 Cargo.toml、tauri.conf.json、capabilities
- [x] **FND-02**: 窗口管理：无边框透明置顶窗口，右下角锚定，拖拽/缩放
- [x] **FND-03**: 系统托盘：显示/隐藏、尺寸切换、鼠标穿透、TTS 开关、模型/退出
- [x] **FND-04**: 日志系统：Rust tracing 替代 electron-log，写入文件
- [x] **FND-05**: 单实例锁：防止多个应用实例同时运行
- [ ] **FND-06**: CI/CD 搭建（deferred to later milestone）

### TTS Engine
- [x] **TTS-01**: system provider (macOS AVSpeechSynthesizer / Windows SAPI / Linux espeak-ng)
- [x] **TTS-02**: local provider (HTTP streaming)
- [x] **TTS-03**: cloud provider (OpenAI / ElevenLabs / Azure)
- [x] **TTS-04**: FIFO queue, text splitting (500 chars/chunk), state broadcast
- [x] **TTS-05**: Tauri Channel audio streaming → Web Audio API + RMS analysis

### HTTP Adapter
- [x] **ADP-01**: axum server :18765, POST /adapter, GET /adapter/capabilities
- [x] **ADP-02**: CancellationToken graceful shutdown

### AI Planner
- [x] **AI-01**: reqwest OpenAI Chat Completions + function calling
- [x] **AI-02**: Three modes (rule/ai/hybrid), config persistence

### Model Management
- [x] **MOD-01**: .riv import via tauri-plugin-dialog
- [x] **MOD-02**: walkdir scanning, models.json registry

### Frontend IPC Migration
- [x] **IPC-01**: src/tauri-adapter.ts abstraction layer
- [x] **IPC-02**: All components migrated to @tauri-apps/api
- [x] **IPC-03**: preload.ts + all electronAPI refs removed

### Distribution
- [x] **DST-01**: tauri-plugin-updater + React update UI
- [x] **DST-02**: macOS .dmg build config
- [x] **DST-03**: Windows .msi build config
- [x] **DST-04**: Linux .AppImage build config

### Cleanup
- [x] **CLN-01**: All Electron/Node.js dependencies removed

---
*Archived: 2026-05-10*
