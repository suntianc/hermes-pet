# Phase 4: Model System Adaptation - Context

**Gathered:** 2026-05-08
**Status:** Ready for planning

<domain>
## Phase Boundary

模型管理系统适配 Rive .riv 文件，清理 Phase 3 遗留的骨架代码和配置。包括：注册表支持 .riv 类型、模型导入流程适配、vivipet-assets 协议确认、SQLite 动作索引的退化处理、electron-builder.yml 修复、以及用户接入文档。

**Requirements:** MODEL-01, MODEL-02, MODEL-03, MODEL-04, MODEL-05

</domain>

<decisions>
## Implementation Decisions

### vivipet-assets 协议 (MODEL-04)
- **D-01:** 保留 vivipet-assets:// 协议 — 已实现且正常工作，有路径穿越防护，渲染器可通过 fetch + ArrayBuffer 传给 Rive
- **D-02:** initModelProtocol 在 electron/main.ts 中保持注册，model-manager.ts 中的协议处理逻辑不变
- **D-03:** 用户导入的 .riv 模型通过 vivipet-assets:// 提供（如 `vivipet-assets://models/<id>/model.riv`）

### 模型导入流程 (MODEL-03)
- **D-04:** `importModelViaDialog()` 改为 .riv 文件选择器 — `filters: [{ name: 'Rive Model (.riv)', extensions: ['riv'] }]`
- **D-05:** 用户选择 .riv 文件后，复制到 `userData/models/<modelId>/` 目录，写入 `.vivipet-registry.json`
- **D-06:** `importModelZip()` 函数可以删除（extract-zip 已移除），替换为 `importRiveModel()` 处理单文件复制
- **D-07:** `listUserModels()` 从 stub 改为扫描 `userData/models/` 下的 `.vivipet-registry.json`，返回 .riv 模型配置

### Rive 动作映射约定 (MODEL-02)
- **D-08:** Rive .riv 模型不触发 SQLite 动作索引 — `indexBundledModels` 应检查 path 扩展名为 `.riv` 时跳过
- **D-09:** .riv 模型的动画由 Rive State Machine 自动管理，无需外部索引
- **D-10:** SM 输入命名约定在文档中说明（`rive-inputs.ts` 常量：state/mouth_open/look_x/look_y/blink/breathe）
- **D-11:** SQLite `action-index.ts` 保留不动（MODEL-02 要求）

### 默认模型
- **D-12:** 准备默认模型基建 — `public/assets/models/models.json` 留空 `"models": []`
- **D-13:** `FALLBACK_MODELS` 留空（已在 Phase 3 清理）
- **D-14:** RiveRenderer 在没有模型时显示 fallback 文字提示（已有 `!modelLoaded` 状态处理）
- **D-15:** 用户准备好 .riv 后，将其放入 `public/models/` 并在 `models.json` 中添加条目即可

### electron-builder.yml 修复
- **D-16:** 移除 `electron-builder.yml` 中 `public/models` 的 extraResources 引用（Phase 3 已删除该目录）
- **D-17:** 未来添加 .riv 模型后在 Phase 4 更新此配置

### 用户文档 (MODEL-05)
- **D-18:** 创建轻量 README 风格文档 `RIVE_MODEL_INTEGRATION.md`（或作为 PROJECT.md 的一部分）
- **D-19:** 文档内容：`rive-inputs.ts` 常量表、SM 输入命名约定、.riv 文件放置位置、models.json 配置方式、vivipet-assets 协议说明
- **D-20:** 提供示例 models.json 配置模板（参考 Phase 1 CONTEXT.md 的模型加载架构）

### Verification
- **D-21:** 启动应用确认 vivipet-assets 协议正确初始化
- **D-22:** 确认 RiveRenderer 在没有 .riv 文件时显示 fallback 而非报错
- **D-23:** 确认 SQLite 索引不对 .riv 路径运行
- **D-24:** 确认 electron-builder 打包不因 extraResources 缺失失败

### the agent's Discretion
- `models.json` 中 .riv 条目的具体 schema — 可参考 Phase 1 的路径/窗口配置，但 actions/capabilities 可以简化或省略（Rive SM 处理）
- 用户模型目录的命名策略（modelId 生成规则）
- 文档文件的具体位置（`docs/` 或项目根目录）

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project context
- `.planning/PROJECT.md` — 项目目标、Rive 迁移计划
- `.planning/REQUIREMENTS.md` §MODEL — MODEL-01~05 完整描述
- `.planning/ROADMAP.md` §Phase 4 — 验证标准

### Prior phase context (key dependencies)
- `.planning/phases/01-rive-rendering-pipeline/01-CONTEXT.md` — RiveRenderer, canvas 架构
- `.planning/phases/02-animation-event-integration/02-CONTEXT.md` — SM 输入体系, rive-inputs.ts
- `.planning/phases/03-live2d-cleanup/03-CONTEXT.md` — 清理后状态, model-manager.ts stubs

### Target files
- `apps/desktop/src/features/pet/model-registry.ts` — 模型注册表（ModelType 已为 'rive'）
- `apps/desktop/src/features/pet/rive-inputs.ts` — SM 输入命名常量
- `apps/desktop/electron/model-manager.ts` — 导入流程、协议、用户模型扫描
- `apps/desktop/electron/action-index.ts` — SQLite 模块（保留，Rive 模型跳过）
- `apps/desktop/electron/preload.ts` — petModel API 表面
- `apps/desktop/electron-builder.yml` — extraResources 引用
- `apps/desktop/public/assets/models/models.json` — 空模型注册表
- `apps/desktop/src/components/PetStage.tsx` — 模型加载 fallback 处理

### Research
- `.planning/codebase/ARCHITECTURE.md` §Model Loading — 模型加载数据流
- `.planning/codebase/INTEGRATIONS.md` §vivipet-assets:// — 协议详情

</canonical_refs>

<code_context>
## Existing Code Insights

### Current state (after Phase 3)
- `model-registry.ts` — `ModelType` 已为 `'rive'`, `FALLBACK_MODELS` 已清空
- `models.json` — 空数组 `"models": []`
- `model-manager.ts` — `importModelViaDialog()` 仍弹 .zip 对话框；`importModelZip()` 是 stub；`listUserModels()` 是 stub；vivipet-assets 协议仍在
- `action-index.ts` — SQLite 模块完整，`indexBundledModels` 仍尝试索引所有模型
- `electron-builder.yml` — 仍引用已删除的 `public/models`
- `PetStage.tsx` — 已有 `!modelLoaded` 时的 fallback 文字显示

### What stays
- `RiveRenderer.ts` — 活跃渲染器
- `PetStage.tsx` — 渲染生命周期
- `pet-store.ts`, `App.tsx` — 状态管理和事件路由
- `electron/action-index.ts` — 保留不动
- `rive-inputs.ts` — SM 输入常量

### What changes
- `model-manager.ts`: importModelViaDialog → .riv dialog; importModelZip → remove; listUserModels → reimplement; indexBundledModels → skip .riv
- `electron-builder.yml`: remove public/models reference
- `models.json`: remains empty (user adds entries)
- NEW: RIVE_MODEL_INTEGRATION.md documentation

</code_context>

<specifics>
## Specific Ideas

- .riv 文件导入流程：用户点击 "Import Model" → 文件选择器（.riv）→ 复制到 userData/models/<id>/ → 写入 .vivipet-registry.json → 通知渲染器刷新
- models.json 中 .riv 条目格式示例：
  ```json
  { "id": "my-pet", "name": "My Pet", "path": "/models/my-pet/model.riv", "type": "rive" }
  ```
- 内置模型路径：`public/models/<Name>/<Name>.riv`（与之前 Live2D 命名一致，文件格式不同）

</specifics>

<deferred>
## Deferred Ideas

- 默认 .riv 模型文件 — 用户自行制作后放入（D-15）
- `electron-builder.yml` extraResources 中 .riv 模型的引用 — 用户添加模型后更新
- Rive Data Binding / ViewModel — 不在规划范围内

</deferred>

---

*Phase: 4-Model System Adaptation*
*Context gathered: 2026-05-08*
