# Requirements: Hermes DeskPet (ViviPet)

**Defined:** 2026-05-08
**Core Value:** 宠物通过生动的动画和语音反馈，让用户感知 AI Agent 的实时工作状态

## v1 Requirements

### RIVE — Rive Rendering Pipeline

- [ ] **RIVE-01**: Renderer can load and display `.riv` file on HTML canvas
- [ ] **RIVE-02**: Renderer implements PetRenderer interface (loadModel, playAction, setSpeaking, lookAt, resize, dispose)
- [ ] **RIVE-03**: Rive State Machine responds to `state` input changes (idle/thinking/speaking/happy/error etc.)
- [ ] **RIVE-04**: Canvas lifecycle managed in PetStage: create → load → render loop → resize → dispose
- [ ] **RIVE-05**: Skinny render loop with requestAnimationFrame drives Rive rendering
- [ ] **RIVE-06**: Multiple `.riv` model switching works (modelIndex change in App.tsx)
- [ ] **RIVE-07**: WASM preloaded at app startup for instant Rive loading

### SYNC — Animation/Event Integration

- [ ] **SYNC-01**: Event system actions map to State Machine inputs (thinking → 'thinking' state)
- [ ] **SYNC-02**: TTS lip sync: RMS amplitude → `mouth_open` input (0.0–1.0)
- [ ] **SYNC-03**: Mouse following: `look_x` / `look_y` inputs from cursor position
- [ ] **SYNC-04**: Idle auto-return: after momentary action, State Machine returns to idle
- [ ] **SYNC-05**: Action interruption works (new action overrides current animation)

### CLEAN — Live2D Code Removal

- [ ] **CLEAN-01**: Remove `src/vendor/cubism/` directory (~200 files)
- [ ] **CLEAN-02**: Remove `public/live2dcubismcore.js` and `public/Framework/`
- [ ] **CLEAN-03**: Remove `public/models/` Live2D model files
- [ ] **CLEAN-04**: Delete `Live2DRenderer.ts` and `capability-resolver.ts`
- [ ] **CLEAN-05**: Update `vite.config.mts` and `tsconfig.json` — remove @framework alias
- [ ] **CLEAN-06**: Update `src/main.tsx` — remove Live2D WASM dynamic loading
- [ ] **CLEAN-07**: Remove unused electron/Cubism-related packages from package.json (gsap, extract-zip)

### MODEL — Model System Adaptation

- [ ] **MODEL-01**: Model registry (`model-registry.ts`) supports `.riv` model type
- [ ] **MODEL-02**: Deprecate action-index for Rive models — SQLite module (`action-index.ts`) stays for future use, skip indexing for `.riv` models
- [ ] **MODEL-03**: Update model import flow (`model-manager.ts`) for `.riv` files
- [ ] **MODEL-04**: Clean up `vivipet-assets://` protocol if no longer needed
- [ ] **MODEL-05**: Provide user Rive model integration docs/API

## v2 Requirements

- **SETT-01**: AI Planner settings panel — verify works with new renderer
- **SETT-02**: TTS settings panel — verify works with new renderer
- **PERF-01**: Performance optimization — idle render loop reduction

## Out of Scope

| Feature | Reason |
|---------|--------|
| Rive Data Binding / ViewModel | State machine inputs sufficient for pet character |
| Rive Layout systems | Not building responsive UI; fixed canvas area |
| Multi-artboard switching | Single character, single artboard |
| Mesh deformations in Rive | Vector animations sufficient; if needed, switch to @rive-app/webgl2 |
| Rive scripting (lua) | All logic stays in TypeScript |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| RIVE-01 | Phase 1 | Pending |
| RIVE-02 | Phase 1 | Pending |
| RIVE-03 | Phase 1 | Pending |
| RIVE-04 | Phase 1 | Pending |
| RIVE-05 | Phase 1 | Pending |
| RIVE-06 | Phase 1 | Pending |
| RIVE-07 | Phase 1 | Pending |
| SYNC-01 | Phase 2 | Pending |
| SYNC-02 | Phase 2 | Pending |
| SYNC-03 | Phase 2 | Pending |
| SYNC-04 | Phase 2 | Pending |
| SYNC-05 | Phase 2 | Pending |
| CLEAN-01 | Phase 3 | Pending |
| CLEAN-02 | Phase 3 | Pending |
| CLEAN-03 | Phase 3 | Pending |
| CLEAN-04 | Phase 3 | Pending |
| CLEAN-05 | Phase 3 | Pending |
| CLEAN-06 | Phase 3 | Pending |
| CLEAN-07 | Phase 3 | Pending |
| MODEL-01 | Phase 4 | Pending |
| MODEL-02 | Phase 4 | Pending |
| MODEL-03 | Phase 4 | Pending |
| MODEL-04 | Phase 4 | Pending |
| MODEL-05 | Phase 4 | Pending |

**Coverage:**
- v1 requirements: 24 total
- Mapped to phases: 24
- Unmapped: 0 ✓

---
*Requirements defined: 2026-05-08*
*Last updated: 2026-05-08 after initial definition*
