# Roadmap: Hermes DeskPet (ViviPet)

**Project:** Hermes DeskPet — Live2D → Rive Migration
**Phases:** 4 | **Requirements:** 24 mapped | All v1 requirements covered ✓

---

### Phase 1: Rive Rendering Pipeline

**Goal:** Rive 渲染引擎替代 Live2D，在 PetStage 中能加载和显示 .riv 动画

**Requirements:** RIVE-01, RIVE-02, RIVE-04, RIVE-05, RIVE-06, RIVE-07

**Success Criteria:**
1. `@rive-app/canvas` 安装并集成到项目中
2. `RiveRenderer.ts` 实现 `PetRenderer` 接口，能加载 `.riv` 文件并播放 State Machine
3. PetStage 使用 RiveRenderer 替代 Live2DRenderer，渲染循环运行正常
4. WASM 预加载机制实现，启动后快速创建 Rive 实例
5. 多模型切换可用（RIVE-06）
6. Canvas resize 正确处理 devicePixelRatio

---

### Phase 2: Animation/Event Integration

**Goal:** 将事件系统、TTS 嘴型同步、鼠标跟随与 Rive State Machine 对接

**Requirements:** SYNC-01, SYNC-02, SYNC-03, SYNC-04, SYNC-05

**Plans:** 2 plans in 2 waves

**Success Criteria:**
1. Agent 事件（thinking/speaking/happy/error 等）正确映射到 Rive State Machine 的 `state` 输入
2. TTS 播报时 `mouth_open` 输入跟随 RMS 振幅变化，嘴型动画同步
3. 鼠标跟随下 `look_x`/`look_y` 输入平滑更新
4. 瞬间动作（如 error）播完后自动回到 idle
5. 新动作能打断当前动画（interrupt 逻辑）

**Plans:**
- [ ] 02-01-PLAN.md — SM 输入缓存 + 动作中断 + Idle 自动返回 (SYNC-01, SYNC-04, SYNC-05)
- [ ] 02-02-PLAN.md — TTS 嘴型同步 + 鼠标跟随平滑 (SYNC-02, SYNC-03)

---

### Phase 3: Live2D Cleanup

**Goal:** 移除所有 Live2D 相关代码、资源和配置

**Requirements:** CLEAN-01, CLEAN-02, CLEAN-03, CLEAN-04, CLEAN-05, CLEAN-06, CLEAN-07

**Success Criteria:**
1. `src/vendor/cubism/` 目录删除
2. `public/live2dcubismcore.js` 和 `public/Framework/` 删除
3. `public/models/` 下 Live2D 模型文件删除
4. `Live2DRenderer.ts` 和 `capability-resolver.ts` 删除
5. Vite/TypeScript 配置移除 `@framework` 别名
6. main.tsx 移除 Cubism Core WASM 动态加载
7. 项目中无 Live2D/Cubism 引用遗留
8. 应用启动和运行正常（回归测试）

---

### Phase 4: Model System Adaptation

**Goal:** 模型管理系统适配 Rive .riv 文件，移除/废弃不再需要的模块

**Requirements:** MODEL-01, MODEL-02, MODEL-03, MODEL-04, MODEL-05

**Success Criteria:**
1. `model-registry.ts` 支持 `.riv` 模型类型注册
2. Rive 模型不触发 SQLite 动作索引（SQLite 保留但暂不用）
3. 模型导入流程可处理 `.riv` 文件
4. `vivipet-assets://` 协议检查并清理（如不再需要）
5. 提供清晰的 Rive 模型接入文档

---

## Summary

| # | Phase | Goal | Requirements | Success Criteria |
|---|-------|------|--------------|------------------|
| 1 | Rive Rendering Pipeline | Rive 渲染引擎替代 | RIVE-01~07 | 6 |
| 2 | Animation/Event Integration | 事件系统对接 | SYNC-01~05 | 5 |
| 3 | Live2D Cleanup | 移除所有 Live2D 代码 | CLEAN-01~07 | 8 |
| 4 | Model System Adaptation | 模型系统适配 .riv | MODEL-01~05 | 5 |

---
*Roadmap created: 2026-05-08*
