# Phase 1: Foundation — Context

**Gathered:** 2026-05-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Tauri 2 项目脚手架、窗口管理、系统托盘、日志系统、单实例锁。目标是让开发者能运行 `cargo tauri dev` 看到一个无边框透明置顶窗口，系统托盘正常工作，日志写入文件，单实例锁生效。

**Requirements:** FND-01 (scaffold), FND-02 (window), FND-03 (tray), FND-04 (logging), FND-05 (single instance)

**Note:** FND-06 (CI/CD) deferred to later phase by user decision.

</domain>

<decisions>
## Implementation Decisions

### Monorepo 策略
- **D-01:** 保留现有 yarn workspace + turborepo 结构管理前端包
- **D-02:** src-tauri/ 放在 apps/desktop/ 下（Tauri 标准惯例）
- **D-03:** packages/shared 和 packages/pet-action-dsl 中的类型定义为 TypeScript-only，Rust 端不重新定义
- **D-04:** Tauri 命令的入参/返回值通过 serde JSON 序列化，类型边界在 tauri-adapter.ts 层

### 窗口状态持久化
- **D-05:** 启动时固定右下角锚定（screen.width - 750, screen.height - 700），使用 tauri-plugin-positioner
- **D-06:** 记住上次关闭时的屏幕和位置，使用 tauri-plugin-window-state
- **D-07:** 多显示器场景：记住上次所在的屏幕和位置

### 托盘菜单设计
- **D-08:** 功能对等迁移，与当前 Electron 托盘完全一致 — 不加不减
- **D-09:** 菜单项：Show/Hide、Always on Top、Mouse Passthrough、Size、Mouse Follow、TTS 开关、TTS 语音源选择、模型切换、导入模型、Quit
- **D-10:** 动态菜单（模型列表、TTS 语音源）通过 tauri::tray::TrayIcon::set_menu() 事件驱动更新
- **D-11:** 使用 tauri-plugin-system-tray（Cargo feature `tray-icon`）

### CI/CD
- **D-12:** Phase 1 不配置 CI/CD。FND-06 推迟到后续阶段

### 日志系统
- **D-13:** 使用 tracing + tracing-subscriber，写入文件
- **D-14:** 平台默认日志位置：macOS ~/Library/Logs/，Linux ~/.local/share/，Windows %APPDATA%

### the agent's Discretion
- 日志格式和轮转策略的具体配置
- 托盘图标的具体图标资源（可复用现有或重新设计）
- Cargo.toml 中具体 crate 版本的选取
- tauri.conf.json 的具体配置参数细节

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Context
- `.planning/PROJECT.md` — Project context, validated requirements, constraints, key decisions
- `.planning/REQUIREMENTS.md` — FND-01 through FND-05 requirement definitions
- `.planning/ROADMAP.md` §Phase 1 — Phase goal, success criteria, dependency info

### Research
- `.planning/research/milestone2/STACK.md` — Tauri 2 stack recommendations, crate versions, cross-platform build
- `.planning/research/milestone2/ARCHITECTURE.md` — Module-per-domain architecture, Tauri state management patterns
- `.planning/research/milestone2/FEATURES.md` — Feature landscape, table stakes vs differentiators
- `.planning/research/milestone2/PITFALLS.md` — P-01 (capabilities model), P-07 (dev workflow), P-09 (multi-monitor)

### Existing Code (for reference)
- `apps/desktop/electron/window.ts` — Current Electron window configuration (frameless, transparent, always-on-top)
- `apps/desktop/electron/tray.ts` — Current system tray implementation (menu structure reference)
- `apps/desktop/electron/preload.ts` — Current IPC surface (for understanding `window.electronAPI` patterns)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `apps/desktop/src/features/pet/RiveRenderer.ts` — Rive rendering engine (stays in WebView, unchanged)
- `apps/desktop/src/components/PetStage.tsx` — Canvas container with mouse tracking (stays in WebView)
- `apps/desktop/src/stores/pet-store.ts` — State management (access via @tauri-apps/api)
- `apps/desktop/src/audio/streaming-player.ts` — Web Audio API player (stays in WebView)

### Established Patterns
- Current Electron main process assumes Node.js IPC → will be replaced by Tauri commands
- Event-driven architecture: External Agent → HTTP Adapter → IPC → Renderer → Pet animation

### Integration Points
- `apps/desktop/electron/preload.ts:68` — `contextBridge.exposeInMainWorld('electronAPI', {...})` defines the full IPC surface that needs Tauri command equivalents
- `apps/desktop/electron/window.ts` — BrowserWindow configuration (width/height, transparent, frame, alwaysOnTop)
- `apps/desktop/electron/tray.ts` — Tray menu structure with Show/Hide, settings, model list, TTS config

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard Tauri 2 approaches. Follow guidance from milestone 2 research (STACK.md, ARCHITECTURE.md).

</specifics>

<deferred>
## Deferred Ideas

- **CI/CD (FND-06)**: User deferred CI/CD setup to a later phase. Phase 1 focuses on local development environment only.
- **FND-06 影响**: Phase 1 success criteria 5 (CI pipeline builds for macOS/Win/Linux) should be removed from verification checklist.

</deferred>

---

*Phase: 1-Foundation*
*Context gathered: 2026-05-09*
