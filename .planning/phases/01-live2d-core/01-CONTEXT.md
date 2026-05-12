# Phase 1: Live2D 核心渲染 — Context

**Gathered:** 2026-05-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Cubism 5 WebGL SDK 集成 → Live2DRenderer 实现 PetRenderer 接口 → 动作映射系统。

**Requirements:** L2D-01 (SDK 集成), L2D-02 (Live2DRenderer), L2D-03 (动作映射)

</domain>

<decisions>
## Implementation Decisions

### Cubism SDK 方案
- **D-01:** 使用官方 Cubism 5 WebGL SDK（本地 Framework 源码方式），不用社区 npm 包
- **D-02:** 从 git 历史提取旧代码作为参考（`a32c13c~1`），但根据 Tauri 2 架构做适配
- **D-03:** Framework SDK 放在 `src/vendor/cubism/Framework/src/`，Core WASM 放在 `public/live2dcubismcore.js`

### WebGL 上下文
- **D-04:** 替换 Rive canvas → Live2D WebGL canvas，PetStage 的角色 canvas 改为 WebGL context
- **D-05:** 背景 canvas 保留（同现在架构，不支持透明动画层可后期移除）
- **D-06:** 单 WebGL context，不创建多个 context（性能考虑）

### 构建配置
- **D-07:** 恢复 `@framework` vite alias → `src/vendor/cubism/Framework/src/`
- **D-08:** Shader 文件放在 `public/Framework/Shaders/WebGL/`（同旧方案路径）
- **D-09:** Core WASM 动态加载（`main.tsx` 中 preload 或按需加载）

### 模型加载方式
- **D-10:** 通过 URL 路径加载（方案 A）：fetch("/models/MyModel/model.model3.json")
- **D-11:** 内建模型放 `public/models/`，构建时一起打包
- **D-12:** 用户导入模型放 app data 目录，通过 tauri asset protocol 映射为可访问 URL
- **D-13:** Cubism Framework 的 `CubismModelSettingJson` 处理相对路径解析

### 动作映射（Phase 1 范围）
- **D-14:** PetRenderer.playAction() → 查找对应 Motion Group → 播放
- **D-15:** 无对应 Motion Group → fallback 到 "Idle" 组
- **D-16:** 动作映射表在 Live2DRenderer 内部维护（常量字典）
- **D-17:** Phase 1 只做核心播放，优先级管理 Phase 2 完善

### the agent's Discretion
- Framework 中具体引入哪些模块（只引入实际使用的，减少体积）
- WebGL context 的创建时机和 canvas 尺寸管理
- 具体动作映射表的 Key-Value 设计
- Fallback 行为的细节（idle motion index）

</decisions>

<canonical_refs>
## Canonical References

### Live2D 旧实现（git history）
- `git show a32c13c~1:apps/desktop/src/features/pet/Live2DRenderer.ts` — 旧 Live2DRenderer 完整实现
- `git show a32c13c~1:apps/desktop/src/features/pet/capability-resolver.ts` — 旧动作映射
- `git show a32c13c~1:apps/desktop/src/features/pet/PetStage.tsx` — 旧 canvas 管理
- `git show a32c13c~1:apps/desktop/vite.config.mts` — 旧的 @framework alias 配置
- `git show a32c13c~1:apps/desktop/src/main.tsx` — Core WASM 动态加载
- `git show a883390~1:public/live2dcubismcore.js` — Core WASM（需从官方重新下载）

### 当前架构
- `.planning/PROJECT.md` — 项目上下文
- `.planning/REQUIREMENTS.md` — L2D-01~03
- `.planning/ROADMAP.md` §Phase 1 — 成功标准
- `apps/desktop/src/features/pet/PetRenderer.ts` — Renderer 接口定义
- `apps/desktop/src/components/PetStage.tsx` — 当前 canvas 管理
- `apps/desktop/vite.config.mts` — 需要修改添加 @framework alias

</canonical_refs>

<code_context>
## Existing Code Insights

### 可复用资产
- `PetRenderer` 接口 — 保持不变，Live2DRenderer 实现同一接口
- `PetStage.tsx` — canvas 管理逻辑可复用，替换 Rive 实例为 Live2D 实例
- `model-registry.ts` — 模型注册表逻辑可复用，格式需适配 Live2D
- `pet-store.ts` — 状态管理保持不变

### 已确立的模式
- 动作通过 `actionName` 字符串传递 → Live2DRenderer 映射为 Motion Group
- 唇形同步通过 RMS 振幅值驱动 → 旧方案通过 `mouthOpen` Cubism parameter
- 鼠标跟随通过 normalized x/y 值 → 旧方案通过 `ParamAngleX`/`ParamAngleY`

### 集成点
- `PetStage.tsx` — 需要从 RiveRenderer 切换为 Live2DRenderer
- `App.tsx` — 仅引用 PetStage，无需修改
- `vite.config.mts` — 需要添加 @framework alias
- `main.tsx` — 可能需要恢复 Core WASM 动态加载

</code_context>

<specifics>
## Specific Ideas

参照旧实现（git history），但做以下改进：
1. 精简 Framework 引入（只引实际用到的模块，不引全部 200+ 文件）
2. 使用 `async/await` 替代旧的 callback 链式加载
3. TypeScript 类型更严格

</specifics>

<deferred>
## Deferred Ideas

- **Rive 清理**: L2D-09~11 在 Phase 4 完成
- **3D 模型支持**: 不在本次里程碑范围内

</deferred>

---

*Phase: 1-Live2D 核心渲染*
*Context gathered: 2026-05-11*
