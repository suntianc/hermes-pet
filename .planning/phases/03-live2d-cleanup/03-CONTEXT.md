# Phase 3: Live2D Cleanup - Context

**Gathered:** 2026-05-08
**Status:** Ready for planning

<domain>
## Phase Boundary

移除所有 Live2D 相关代码、资源、配置和依赖。Phase 1&2 已完成 Rive 渲染引擎替代，Live2D 代码已成为死代码。此阶段只做删除和清理，不涉及任何新功能。

**Requirements:** CLEAN-01, CLEAN-02, CLEAN-03, CLEAN-04, CLEAN-05, CLEAN-06, CLEAN-07

</domain>

<decisions>
## Implementation Decisions

### 删除策略
- **D-01:** 一次性大爆炸删除 — 先删所有 Live2D 文件和目录，然后修复编译错误。git 可安全回滚，无需中间步骤。
- **D-02:** 删除后通过 `npm run build`（TypeScript 编译）验证无残留引用

### 要删除的文件和目录
- **D-03:** 删除 `src/vendor/cubism/` — Cubism 5 Framework SDK（~200 文件）
- **D-04:** 删除 `src/vendor/live2dcubismcore.d.ts` — Cubism Core 类型定义
- **D-05:** 删除 `public/live2dcubismcore.js` — Cubism Core WASM 加载器
- **D-06:** 删除 `public/Framework/` — WebGL shader 文件（14 个 .frag/.vert）
- **D-07:** 删除 `public/models/` — 所有 Live2D 模型文件（Vivian + Jian，~50 文件包括 .moc3, .model3.json, .motion3.json, .exp3.json, .physics3.json, textures）
- **D-08:** 删除 `src/features/pet/Live2DRenderer.ts` — Cubism 5 WebGL 渲染器（~600 行）
- **D-09:** 删除 `src/features/pet/capability-resolver.ts` — 动作命名→动画组映射

### 要修改的配置文件
- **D-10:** `vite.config.mts` — 移除 `@framework` 别名（Line 16），保留 `@`, `@pet-action-dsl`, `@shared`
- **D-11:** `tsconfig.json` — 移除 `@framework/*` 路径映射（Line 18），保留其他 paths

### 要修改的源文件
- **D-12:** `src/main.tsx` — 移除 `loadScript('./live2dcubismcore.js')` (Line 38)，`loadScript` 函数可以保留（通用工具函数）或按 unused 判断删除
- **D-13:** `src/features/pet/model-registry.ts` — 从 `ModelType` 移除 `'live2d'`，只保留 `'rive'`；`FALLBACK_MODELS` 中 Jian 的 path 改为 Rive .riv 路径或移除此 fallback
- **D-14:** `src/features/pet/PetRenderer.ts` — 从 `PetRendererType` 移除 `'live2d'`，只保留 `'spine' | 'gif' | 'vrm'`
- **D-15:** `src/App.tsx:415` — 将 `.live2d-container` 改为 `.rive-container`
- **D-16:** `src/features/pet-performance/pet-performance-director.ts:12` — 将 `.live2d-container` 改为 `.rive-container`

### 要修改的数据文件
- **D-17:** `public/assets/models/models.json` — 移除现有 Live2D 模型条目（Jian/Vivian），Phase 4 添加 .riv 条目

### 要修改的主进程文件
- **D-18:** `electron/model-manager.ts` — 移除 `import extractZip from 'extract-zip'`（Line 6），移除 `.model3.json` 文件扫描/校验逻辑（Line 115-120），保留其余结构（Phase 4 中适配 .riv）
- **D-19:** `package.json` — 移除 `gsap` 和 `extract-zip` 依赖

### 不在此阶段处理的内容
- **`electron/action-index.ts`** (SQLite 模块) — 保留不动，MODEL-02 说明暂留
- **`electron/model-manager.ts` 完整 .riv 适配** — Phase 4 处理
- **`vivipet-assets://` 协议** — Phase 4 评估是否需要清理
- **Rive .riv 模型文件** — Phase 4 添加
- **动作映射从 Live2D motion group → Rive SM** — 已在 Phase 2 通过 Rive SM state 输入处理

### 验证策略
- **D-20:** 删除后用 `npm run build` 确保 TypeScript 编译零错误
- **D-21:** 用 grep 搜索 `live2d|cubism|\.moc3|\.model3|live2dcubism` 确认无残留引用（仅期望 legacy 文件自身的 license header 注释残留，不影响编译）
- **D-22:** `npm run dev:renderer` 确认应用启动正常，Rive 渲染循环无报错

### the agent's Discretion
- `loadScript()` 函数在 main.tsx 中是否删除 — 如果移除 Cubism 加载后该函数只剩一个使用者（Rive WASM），可保留或内联
- FALLBACK_MODELS 的处理 — 可以直接移除或改为指向示例 .riv 文件
- 删除文件的精确顺序 — 只要最终结果正确，中间步骤可灵活安排

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project context
- `.planning/PROJECT.md` — 项目目标、Rive 迁移计划
- `.planning/REQUIREMENTS.md` — CLEAN-01~07 完整描述
- `.planning/ROADMAP.md` §Phase 3 — 验证标准和范围

### Phase 1 & 2 decisions (dependency context)
- `.planning/phases/01-rive-rendering-pipeline/01-CONTEXT.md` — RiveRenderer 替代 Live2DRenderer
- `.planning/phases/02-animation-event-integration/02-CONTEXT.md` — 事件系统已对接 Rive SM

### Target files for modification
- `apps/desktop/vite.config.mts` — 需移除 `@framework` 别名
- `apps/desktop/tsconfig.json` — 需移除 `@framework/*` 路径映射
- `apps/desktop/src/main.tsx` — 需移除 Cubism WASM 加载
- `apps/desktop/src/features/pet/model-registry.ts` — 需移除 `'live2d'` 类型
- `apps/desktop/src/features/pet/PetRenderer.ts` — 需移除 `'live2d'` 渲染器类型
- `apps/desktop/src/App.tsx` — 需重命名 CSS 类
- `apps/desktop/src/features/pet-performance/pet-performance-director.ts` — 需重命名 CSS 类
- `apps/desktop/public/assets/models/models.json` — 需移除 Live2D 条目
- `apps/desktop/electron/model-manager.ts` — 需移除 extract-zip 和 .model3.json 逻辑
- `apps/desktop/package.json` — 需移除 gsap 和 extract-zip

### Target files/ directories for deletion
- `apps/desktop/src/vendor/cubism/` (entire directory)
- `apps/desktop/src/vendor/live2dcubismcore.d.ts`
- `apps/desktop/src/features/pet/Live2DRenderer.ts`
- `apps/desktop/src/features/pet/capability-resolver.ts`
- `apps/desktop/public/live2dcubismcore.js`
- `apps/desktop/public/Framework/` (entire directory)
- `apps/desktop/public/models/` (entire directory, all Live2D models)

### Research
- `.planning/phases/02-animation-event-integration/02-RESEARCH.md` — Rive 运行时已验证可用

</canonical_refs>

<code_context>
## Existing Code Insights

### Non-Live2D references that need cleanup
- `.live2d-container` CSS 类名在 2 个组件中硬编码 — 需要改为 `.rive-container`
- `ModelType 'live2d'` 枚举值在 `model-registry.ts:1` — 需要删除
- `PetRendererType 'live2d'` 枚举值在 `PetRenderer.ts:22` — 需要删除
- `public/assets/models/models.json` 包含 Live2D 动作映射 — 需要删除条目
- `electron/model-manager.ts` 包含 `.model3.json` 扫描逻辑 — 需要清理

### What stays
- `RiveRenderer.ts` (Phase 1&2) — 活跃渲染器，不动
- `PetStage.tsx` — 已使用 RiveRenderer，不动
- `pet-store.ts` — 状态管理，不动
- `electron/action-index.ts` — SQLite 模块，保留（Phase 4 决定用途）
- `electron/ipc.ts`, `electron/tray.ts` — 主进程基础设施，不动
- `src/features/pet-events/` — 事件系统，不动

### Verification grep patterns
```
# Before: check all Live2D references exist
grep -rn "live2d\|cubism\|\.moc3\|\.model3\|live2dcubism\|extract-zip\|gsap" \
  --include="*.{ts,tsx,mts,json}" apps/desktop/src apps/desktop/electron \
  apps/desktop/vite.config.mts apps/desktop/tsconfig.json apps/desktop/package.json

# After: only legacy license headers in deleted files remain (will be gone after git rm)
# Expected survivors after cleanup: none that affect compilation or runtime
```

</code_context>

<specifics>
## Specific Ideas

- 删除顺序建议：先删所有文件和目录，再修配置，最后修源代码引用。这种顺序编译错误最清晰可预测。
- gsap 清理：确认没有其他代码依赖 gsap（PetPerformanceDirector 可能使用了独立的动画逻辑）
- extract-zip 清理：只被 model-manager.ts 的 .zip 导入流程使用，移除该导入即可

</specifics>

<deferred>
## Deferred Ideas

- `electron/model-manager.ts` 完整 .riv 适配 — Phase 4
- `electron/action-index.ts` 重构或清理 — Phase 4 评估
- `vivipet-assets://` 协议清理 — Phase 4
- 添加 Rive .riv 示例模型文件 — Phase 4
- `electron-builder.yml` 中 extraResources 调整（移除 public/models/） — Phase 4

</deferred>

---

*Phase: 3-Live2D Cleanup*
*Context gathered: 2026-05-08*
