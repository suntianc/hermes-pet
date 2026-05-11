# Milestone 2: Tauri Migration — Archived Roadmap

**Version:** v2.0
**Completed:** 2026-05-10
**Commits:** 65 commits
**Files changed:** 82 files, +12,764 / -15,015

## Executive Summary

Electron → Tauri 2 + Rust 全面迁移。移除所有 Electron/Node.js 后端代码（~15,000 行），创建 Rust/Tauri 后端模块（~5,100 行）。前端 React + Rive + Vite 层保持不变。零 Node.js 依赖。

## Phases

| Phase | Requirements | Status |
|-------|-------------|--------|
| 1 — Foundation | FND-01~05 | ✅ Complete |
| 2 — TTS Engine | TTS-01~05 | ✅ Complete |
| 3 — HTTP Adapter | ADP-01~02 | ✅ Complete |
| 4 — Model Management | MOD-01~02 | ✅ Complete |
| 5 — AI Planner | AI-01~02 | ✅ Complete |
| 6 — Frontend IPC Migration | IPC-01~03 | ✅ Complete |
| 7 — Distribution | DST-01~04 | ✅ Complete |
| 8 — Cleanup | CLN-01 | ✅ Complete |

## Rust Backend Architecture

```
src-tauri/src/
├── main.rs              ← Tauri 入口
├── lib.rs               ← 插件 + invoke_handler + setup
├── commands/            ← 12+ Tauri commands
│   ├── window.rs        ← 窗口命令 (drag, resize, passthrough)
│   ├── tts.rs           ← TTS 命令 (speak, stop, config, voices)
│   ├── models.rs        ← 模型命令 (list, import, scan)
│   └── ai.rs            ← AI 命令 (plan, config, test)
├── window/              ← 窗口管理 (frameless, position)
├── tray/                ← 系统托盘 (11 项菜单)
├── tts/                 ← TTS 引擎 (3 providers, queue, Channel)
│   └── providers/       ← system, local, cloud
├── adapter/             ← axum HTTP :18765
├── ai/                  ← OpenAI planner (rule/ai/hybrid)
├── models/              ← .riv import, scan, registry
├── logging.rs           ← tracing + file output
├── state.rs             ← AppState
└── error.rs             ← AppError
```

## Tech Debt

1. Updater pubkey placeholder (`TODO_ADD_YOUR_PUBKEY_HERE`)
2. macOS code signing secrets not configured
3. 26 unused-function warnings in Rust
4. API key encryption deferred (plaintext in store)

---
*Archived: 2026-05-10*
