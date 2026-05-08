# Phase 1: Rive Rendering Pipeline — Context

**Gathered:** 2026-05-08
**Status:** Ready for planning

<domain>
## Phase Boundary

在 PetStage 中用 Rive 渲染引擎替代 Live2D。创建多层 canvas 架构（角色层 + 背景层），加载 `.riv` 文件并通过 Rive State Machine 播放动画。不包括事件系统对接（Phase 2）或 Live2D 清理（Phase 3）。

**Requirements:** RIVE-01, RIVE-02, RIVE-04, RIVE-05, RIVE-06, RIVE-07

</domain>

<decisions>
## Implementation Decisions

### Rive 运行时
- **D-01:** 使用 `@rive-app/canvas` — Canvas2D 渲染器，拆图骨骼动画流程无需 WebGL
- **D-02:** 不引入 `@rive-app/webgl2` — 角色使用拆图+骨骼+约束，无位图网格变形需求
- **D-03:** 不使用 `@rive-app/react-canvas` — PetStage 手管 canvas 生命周期，React 封装层不匹配

### Canvas 策略
- **D-04:** 多层 canvas 架构 — PetStage 内同时管理角色 canvas 和背景 canvas
- **D-05:** 角色 canvas — 主交互层，60fps，鼠标事件绑定
- **D-06:** 背景 canvas — 透明环境动画层，可独立帧率
- **D-07:** 两层均为 `@rive-app/canvas` 实例，无 WebGL context 数限制
- **D-08:** 指针事件只在角色层处理，背景层事件穿透

### 模型加载
- **D-09:** 组合方案：fetch + ArrayBuffer 传给 `new Rive({ buffer })`
- **D-10:** 内置模型通过 Vite publicDir URL fetch
- **D-11:** 用户导入模型通过 vivipet-assets:// 自定义协议 fetch
- **D-12:** 在 RiveRenderer 中统一抽象 `loadModel(source)` 接口

### State Machine 输入设计
- **D-13:** Hybrid 方案 — string 主状态 + trigger 辅助 + number 参数
- **D-14:** 主输入 `state` (string) — 值直接映射事件系统 action name
  - 值集合：idle / thinking / speaking / happy / error / searching / coding / terminal / confused / angry
- **D-15:** 辅助 trigger 输入 — `blink`、`breathe` 等循环动画触发
- **D-16:** Phase 2 追加 number 输入 — `mouth_open` (0.0–1.0)、`look_x`/`look_y` (-1.0–1.0)
- **D-17:** 输入名称常量定义在 `src/features/pet/rive-inputs.ts` — 与 Rive Editor 命名精确匹配

### the agent's Discretion
- SM 输入名称的具体命名（`blink`/`breathe` 等）可在实现时微调
- 背景 canvas 的具体帧率和动画调度策略由实施决定
- RiveRenderer 接口的 `setSpeaking()` 方法做空壳返回（嘴型同步 Phase 2 实现）

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project context
- `.planning/PROJECT.md` — 项目目标、核心价值、需求分类
- `.planning/REQUIREMENTS.md` — 完整 v1 需求（RIVE-01~07 为 Phase 1）
- `.planning/ROADMAP.md` — 4 阶段路标和验证标准

### Codebase architecture
- `.planning/codebase/ARCHITECTURE.md` §Live2D Rendering — PetRenderer 接口定义（需适配）
- `.planning/codebase/STACK.md` §Live2D Cubism 5 SDK — 当前渲染堆栈
- `.planning/codebase/CONVENTIONS.md` — 编码规范（命名、错误处理、安全模式）
- `.planning/codebase/STRUCTURE.md` §Renderer — PetStage/Live2DRenderer 文件位置

### Research
- `.planning/research/STACK.md` — Rive 集成技术选型推荐
- `.planning/research/ARCHITECTURE.md` — Rive 集成架构和组件关系
- `.planning/research/FEATURES.md` — Rive API 参考和功能清单
- `.planning/research/PITFALLS.md` — 已知陷阱和预防策略

### Key source files
- `apps/desktop/src/components/PetStage.tsx` — canvas 生命周期管理（需改造为多层）
- `apps/desktop/src/features/pet/PetRenderer.ts` — 渲染器接口（RiveRenderer 需实现）
- `apps/desktop/src/features/pet/Live2DRenderer.ts` — 当前实现（参考接口方法）
- `apps/desktop/src/main.tsx` — WASM 加载入口（需加 Rive WASM 预加载）
- `apps/desktop/vite.config.mts` — 构建配置（publicDir、别名）

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `PetRenderer.ts` — 抽象接口可直接复用，RiveRenderer 实现相同方法签名
- `PetStage.tsx` §renderer lifecycle — `useEffect` 管理 renderer 创建/更新/销毁模式可沿用
- `electron/model-manager.ts` — vivipet-assets:// 协议已注册可用

### Established Patterns
- **Renderer 接口模式**: loadModel → playAction → setSpeaking → lookAt → resize → dispose
- **WASM 动态加载**: `main.tsx` 的 `loadScript()` 函数可复用于 Rive WASM
- **模型切换**: `modelIndex` + `modelRevision` 状态驱动，PetStage 监听变化

### Integration Points
- `PetStage.tsx:useEffect` 监听 `modelIndex`/`modelRevision` 变化 → 调用 `renderer.loadModel()`
- `PetStage.tsx:requestAnimationFrame` 渲染循环 → Rive 运行时接管或共存
- `App.tsx:setAction` → `actionRevision++` → `PetStage` → `renderer.playAction()`
- `main.tsx` 的 `loadScript()` → 改为 Rive WASM 预加载

### Creative Options
- 多层 canvas 可以用 CSS `mix-blend-mode` 实现视觉叠加效果
- 背景 canvas 可在 idle 状态降帧（30fps）节省资源

</code_context>

<specifics>
## Specific Ideas

- **背景动画方向**: 随时间变化的环境氛围（如渐变颜色漂移、粒子感、光影变化）— 作为 Rive .riv 文件中的独立 Artboard/State Machine
- **用户自己制作 .riv 文件**，代码层只做加载和驱动

</specifics>

<deferred>
## Deferred Ideas

- **event → SM 输入映射** (SYNC-01) — Phase 2 处理
- **TTS 嘴型同步** (SYNC-02) — Phase 2 处理
- **鼠标跟随** (SYNC-03) — Phase 2 处理
- **Live2D 代码清理** (CLEAN-01~07) — Phase 3 处理
- **模型注册表适配** (MODEL-01~05) — Phase 4 处理

</deferred>

---

*Phase: 1-Rive Rendering Pipeline*
*Context gathered: 2026-05-08*
