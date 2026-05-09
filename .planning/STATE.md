# STATE.md — Hermes DeskPet

**Status:** Milestone 2 — Electron → Tauri 2 + Rust Migration
**Current Phase:** Roadmapping — Phase structure defined, awaiting execution

---

## Project Reference

**Core value:** 宠物通过生动的动画和语音反馈，让用户感知 AI Agent 的实时工作状态
**Current focus:** 将全部 Electron/Node.js 后端 (~15 个文件) 重写为 Rust/Tauri 2 commands，前端 Rive + React 层保持不变

**Key constraint:** 跨平台 (macOS/Windows/Linux)，零 Node.js 依赖，质量和完整性优先于速度

---

## Current Position

| Item | Value |
|------|-------|
| Milestone | 2 — Tauri Migration |
| Current Phase | Roadmap defined (8 phases, 25 requirements mapped) |
| Current Plan | — |
| Status | Not started — awaiting roadmap approval |
| Progress | 0/25 requirements complete |

### Phase Snapshot

| Phase | Status | Requirements | Ready For |
|-------|--------|-------------|-----------|
| 1 — Foundation | Not started | FND-01~06 | Plan: Phase 1 |
| 2 — TTS Engine | Not started | TTS-01~05 | Blocked by Phase 1 |
| 3 — HTTP Adapter | Not started | ADP-01~02 | Blocked by Phase 1 |
| 4 — Model Management | Not started | MOD-01~02 | Blocked by Phase 1 |
| 5 — AI Planner | Not started | AI-01~02 | Blocked by Phase 4 |
| 6 — Frontend IPC Migration | Not started | IPC-01~03 | Blocked by Phases 2-5 |
| 7 — Distribution | Not started | DST-01~04 | Blocked by Phase 6 |
| 8 — Cleanup | Not started | CLN-01 | Blocked by Phase 7 |

---

## Performance Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Requirements mapped | 25/25 ✓ | 100% |
| Phases defined | 8 | 8 |
| Electron backend files remaining | ~15 | 0 |
| Rust backend files to write | 0 | ~25 |

---

## Accumulated Context

### Key Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| D-01 | 8-phase structure with parallelizable Phases 2-4 | TTS/Adapter/Model have no interdependencies; parallel execution possible |
| D-02 | CI/CD in Phase 1 (Foundation) | Research P-03 requires cross-platform CI for TTS testing across all platforms |
| D-03 | FND-06 moved from Phase 7 → Phase 1 | Cross-platform CI needed early to validate TTS/signing work in later phases |
| D-04 | DST-01 (updater UI) and signing separate from CLN-01 | Cleanup is structural (remove Electron); distribution is additive (build artifacts) |
| D-05 | Phase 6 depends on Phases 2-5 | Frontend adapter can't be E2E tested without all Rust backends complete |
| D-06 | Horizontal layers approach | Build complete backend layers first, connect frontend at end |

### Open Questions

| # | Question | Raised In |
|---|----------|-----------|
| Q-01 | Windows SAPI TTS — exact PowerShell command syntax unverified | Research Gap |
| Q-02 | Linux espeak-ng availability in CI runner (Ubuntu) | Research Gap |
| Q-03 | Tauri Channel binary throughput ceiling (Uint8Array size limits for audio) | Research Gap |

### Dependencies

- Phases 2, 3, 4 can execute in parallel after Phase 1
- Phase 5 must wait for Phase 4 (Model Management)
- Phase 6 is the convergence point — all Rust backends must be complete
- Phase 7 requires all frontend IPC working for update UI
- Phase 8 is the final capstone

---

## Session Continuity

### Last Session

- Milestone 2 initialized with research (STACK, FEATURES, ARCHITECTURE, PITFALLS, SUMMARY)
- 25 v1 requirements defined across 8 categories (FND, TTS, ADP, AI, MOD, IPC, DST, CLN)
- Roadmap created with 8 phases matching research recommendations
- All 25 requirements mapped with 100% coverage

### Next Action

Approve ROADMAP.md, then `/gsd-plan-phase 1` to begin Foundation phase planning.

```
Phase 1: Foundation → cargo tauri dev, frameless window, tray, logging, single instance, CI/CD
Phase 2: TTS → system/local/cloud providers, queue, Channel streaming
Phase 3: Adapter → axum :18765, graceful shutdown
Phase 4: Model → import, walkdir scan, registry
Phase 5: AI → reqwest OpenAI, function calling, rule/ai/hybrid modes
Phase 6: IPC → tauri-adapter.ts, migrate components, remove preload
Phase 7: Distribution → updater, signing, .dmg/.msi/.AppImage
Phase 8: Cleanup → remove all Electron/Node.js
```

---

*Last updated: 2026-05-09 after Milestone 2 roadmap creation*
