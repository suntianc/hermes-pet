# Roadmap: Hermes DeskPet

## Milestones

- ✅ **Milestone 1** — Live2D → Rive 迁移 (shipped)
- ✅ **Milestone 2** — Electron → Tauri 2 + Rust 迁移 (shipped, see `.planning/milestones/v2-ROADMAP.md`)
- 🚧 **v3.0 Live2D 回归** — 在 Tauri 2 架构上重新集成 Live2D Cubism 5 WebGL 渲染引擎 (in progress)

## Phases

- [ ] **Phase 1: Live2D 核心渲染** — Cubism 5 WebGL SDK 集成、Live2DRenderer、动作映射
- [ ] **Phase 2: 动画与交互** — TTS 唇形同步、鼠标跟随、空闲动画
- [ ] **Phase 3: 模型管理** — .moc3 导入、models.json 注册表更新
- [ ] **Phase 4: 清理收尾** — 移除 Rive 依赖与代码、更新文档

## Phase Details

### Phase 1: Live2D 核心渲染
**Goal**: Live2D .moc3 模型在 PetStage 画布中渲染，并通过动作状态驱动对应动画
**Depends on**: Nothing (milestone 首个阶段)
**Requirements**: L2D-01, L2D-02, L2D-03
**Success Criteria** (what must be TRUE):
  1. Cubism 5 WebGL SDK 成功加载并初始化 WebGL 上下文，无报错
  2. Live2D .moc3 模型在 PetStage canvas 中以 60fps 流畅渲染
  3. Live2DRenderer 的 playAction() 驱动对应 Live2D Motion 播放（如 thinking → 对应 Motion 组）
  4. 无对应动作映射时自动 fallback 到 idle motion，不会黑屏或报错
  5. 模型销毁（destroy）和重建不泄漏 WebGL 资源
**Plans**: 3 plans
**UI hint**: yes

Plans:
- [ ] 01-01: Cubism 5 WebGL SDK 集成 — 动态加载、WebGL 上下文初始化、渲染循环
- [ ] 01-02: Live2DRenderer 实现 — loadModel、playAction、setSpeaking、lookAt、resize、destroy
- [ ] 01-03: 动作映射系统 — 10 种动作状态 → Live2D Motion 组映射、fallback 机制

### Phase 2: 动画与交互
**Goal**: 宠物具备完整的动画交互能力（唇形同步、鼠标跟随、空闲动画循环）
**Depends on**: Phase 1
**Requirements**: L2D-04, L2D-05, L2D-06
**Success Criteria** (what must be TRUE):
  1. TTS 播放时嘴部参数 mouthOpen 实时响应 RMS 振幅值，唇形与语音同步
  2. 鼠标在画布上移动时宠物视线跟随光标（ParamAngleX/ParamAngleY）
  3. 空闲状态下呼吸动画 + 眨眼触发自动循环播放
  4. 400ms 无操作后自动回到 idle 动作状态
**Plans**: 3 plans
**UI hint**: yes

Plans:
- [ ] 02-01: TTS 唇形同步 — mouthOpen 参数驱动、StreamingAudioPlayer 振幅桥接
- [ ] 02-02: 鼠标跟随 — look_x/look_y 事件 → Live2D 参数映射
- [ ] 02-03: 空闲动画循环 — 呼吸 + 眨眼自动触发、400ms 超时 idle 回归

### Phase 3: 模型管理
**Goal**: 用户可导入和切换 Live2D 模型，管理系统适配 .moc3 格式
**Depends on**: Phase 1, Phase 2
**Requirements**: L2D-07, L2D-08
**Success Criteria** (what must be TRUE):
  1. 通过导入对话框选择 .moc3 文件后，模型文件被正确复制到 models 目录
  2. .model3.json 的解析正确提取 motions/expressions 元数据
  3. 导入后模型出现在模型列表中，切换后可正常渲染
  4. models.json 记录 Live2D 模型格式（moc3 路径、motion 组、texture 信息），兼容内建 + 用户导入
**Plans**: 2 plans
**UI hint**: yes

Plans:
- [ ] 03-01: .moc3 导入流程 — 文件对话框、文件复制、.model3.json 解析
- [ ] 03-02: models.json 注册表更新 — Live2D 格式定义、内建 + 用户模型合并

### Phase 4: 清理收尾
**Goal**: 项目完全移除 Rive 依赖和代码，文档反映 Live2D 架构
**Depends on**: Phase 1, Phase 2, Phase 3
**Requirements**: L2D-09, L2D-10, L2D-11
**Success Criteria** (what must be TRUE):
  1. @rive-app/canvas 从 package.json 和 node_modules 移除，build 通过
  2. RiveRenderer.ts、rive-inputs.ts 等 Rive 相关代码文件全部删除
  3. .riv 文件导入和管理代码全部移除
  4. CLAUDE.md 和项目文档更新为 Live2D 架构描述
  5. `vite build` + `cargo tauri build` 编译通过，无 Rive 引用残留
**Plans**: 3 plans

Plans:
- [ ] 04-01: 移除 @rive-app/canvas 依赖 + RiveRenderer 等 Rive 代码
- [ ] 04-02: 移除 .riv 导入和管理代码
- [ ] 04-03: 更新 CLAUDE.md 和项目文档

## Progress

**Execution Order:** 1 → 2 → 3 → 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Live2D 核心渲染 | 0/3 | Not started | - |
| 2. 动画与交互 | 0/3 | Not started | - |
| 3. 模型管理 | 0/2 | Not started | - |
| 4. 清理收尾 | 0/3 | Not started | - |
