# Phase 1: Foundation — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-09
**Phase:** 1-Foundation
**Areas discussed:** Monorepo 策略, 窗口状态持久化, 托盘菜单设计, CI/CD 策略

---

## Monorepo 策略

| Option | Description | Selected |
|--------|-------------|----------|
| 保留现有结构 (Recommended) | 保持 yarn workspace + turborepo 管理前端包，src-tauri/ 放在 apps/desktop/ 下 | ✓ |
| 大幅简化 | 移除 yarn workspace / turborepo，将所有前端包合并到 apps/desktop/ | |
| 混合方式 | 保留包结构但去掉 turborepo，用 npm scripts 替代 | |

**User's choice:** 保留现有结构 (Recommended)
**Notes:** 用户确认 monorepo 结构保持不变

| Option | Description | Selected |
|--------|-------------|----------|
| TypeScript-only (Recommended) | 类型定义只在前端用，Rust 端不重新定义 | ✓ |
| Rust 端也维护一份对应 | 在 Rust 端用相同结构体定义类型 | |
| 先生成 JSON Schema 再转 Rust | 从 TS 类型生成 JSON Schema，再用 schemars 生成 Rust struct | |

**User's choice:** TypeScript-only (Recommended)
**Notes:** 类型边界在 tauri-adapter.ts 层处理

---

## 窗口状态持久化

| Option | Description | Selected |
|--------|-------------|----------|
| 固定右下角 (Recommended) | 每次启动在屏幕右下角固定位置 | |
| 记住位置/大小 | 用 tauri-plugin-window-state 记住窗口位置和大小 | |
| 固定 + 记录退出位置 | 启动固定右下角，但会话中移动后下次启动恢复上次位置 | ✓ |

**User's choice:** 固定 + 记录退出位置
**Notes:** 混合方案：启动固定右下角，使用 tauri-plugin-window-state 记录退出位置和屏幕

| Option | Description | Selected |
|--------|-------------|----------|
| 跟随鼠标所在屏幕 (Recommended) | 启动时锚定当前鼠标所在屏幕的右下角 | |
| 固定主屏幕 | 永远在主屏幕右下角 | |
| 记住上次所在的屏幕 | 启动时恢复到上次关闭时的屏幕和位置 | ✓ |

**User's choice:** 记住上次所在的屏幕
**Notes:** 多显示器场景用 tauri-plugin-window-state 记住

---

## 托盘菜单设计

| Option | Description | Selected |
|--------|-------------|----------|
| 全部保留 + 扩充 | 全部保留加上 Rust 特有功能入口 | |
| 全部保留，不变动 | 功能对等迁移，不加不减 | ✓ |
| 精简菜单 | 移除低频使用项，放到前端 UI | |

**User's choice:** 全部保留，不变动
**Notes:** 功能对等迁移，与当前 Electron 托盘完全一致

| Option | Description | Selected |
|--------|-------------|----------|
| 事件驱动更新 (Recommended) | Rust 端用 set_menu 在运行时替换整个菜单 | ✓ |
| 两级菜单 | 点击时先占位再异步加载 | |
| 前端渲染替代 | 动态内容通过前端 UI 实现 | |

**User's choice:** 事件驱动更新 (Recommended)
**Notes:** tauri::tray::TrayIcon::set_menu() 运行时更新

---

## CI/CD 策略

| Option | Description | Selected |
|--------|-------------|----------|
| tauri-action + 现有 CI 整合 (Recommended) | 使用官方 tauri-action，分阶段迁移 | |
| 完全替换 CI | 重写全部 CI 为 Tauri 专用流程 | |
| 先不配置 CI | Phase 1 专注本地开发环境 | ✓ |

**User's choice:** 先不配置 CI
**Notes:** FND-06 推迟到后续阶段处理

---

## the agent's Discretion

- 日志格式和轮转策略的具体配置
- 托盘图标的具体图标资源
- Cargo.toml 中具体 crate 版本
- tauri.conf.json 的具体配置参数细节

## Deferred Ideas

- CI/CD (FND-06) — 推迟到后续阶段
