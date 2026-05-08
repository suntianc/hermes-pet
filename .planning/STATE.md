# STATE.md — Hermes DeskPet

**Status:** Phase 2 Complete
**Current Phase:** Phase 3 — Live2D Cleanup

---

## Project Reference

See: `.planning/PROJECT.md` (updated 2026-05-08)

**Core value:** 宠物通过生动的动画和语音反馈，让用户感知 AI Agent 的实时工作状态
**Current focus:** Live2D → Rive 迁移

---

## Progress

| Phase | Status | Requirements | Progress |
|-------|--------|-------------|----------|
| 1 — Rive Rendering Pipeline | ✓ Complete | RIVE-01~07 | 100% |
| 2 — Animation/Event Integration | ✓ Complete | SYNC-01~05 | 100% |
| 3 — Live2D Cleanup | ○ Pending | CLEAN-01~07 | 0% |
| 4 — Model System Adaptation | ○ Pending | MODEL-01~05 | 0% |

**Overall:** 11/24 requirements complete | 2/4 phases complete

---

## Last Session

- Phase 1 executed: 2 plans completed
- @rive-app/canvas installed and integrated
- RiveRenderer + multi-canvas PetStage operational
- model-registry updated with Rive type support

## Current Session

- Phase 2 context gathered: 5 gray areas analyzed, all agent-decided
- Implementation decisions: idle timer hybrid, PetStore polling lip sync, RiveRenderer lerp smoothing, immediate action interrupt
- CONTEXT.md written with 17 locked decisions (D-01~D-17)

## Last Session (Phase 2 Executed)

- 2 plans executed across 2 waves, 6 tasks total
- RiveRenderer.ts: 184→372 lines (+199/-15)
- SM input caching: stateInput, mouthOpenInput, lookXInput, lookYInput cached in loadModel
- Idle auto-return: hybrid timer for 5 momentary actions (400ms)
- TTS lip sync: RMS amplitude → mouth_open via 0.05 clamp + EMA filter
- Mouse follow: lerp(0.1) smoothing, -1.0~1.0 normalization
- rAF render loop: updateMouseFollow → updateLipSync at display refresh rate
- Build: 0 TypeScript errors, full vite build passes

## Next Action

```
/gsd-discuss-phase 3
```

---
*Last updated: 2026-05-08 after project initialization*
