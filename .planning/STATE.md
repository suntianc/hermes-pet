# STATE.md — Hermes DeskPet

**Status:** Milestone 2 — Tauri Migration | Phase 2 TTS Engine Complete
**Current Phase:** TTS Engine — system/local/cloud providers, Channel streaming, 5 Tauri commands

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
| Current Phase | Phase 2: TTS Engine |
| Current Plan | — |
| Status | Complete |
| Progress | 5/25 requirements complete |

### Phase Snapshot

| Phase | Status | Requirements | Ready For |
|-------|--------|-------------|-----------|
| 1 — Foundation | Complete | FND-01~05 (06 deferred) | Verifying |
| 2 — TTS Engine | **Complete** | TTS-01~05 ✅ | Verified |
| 3 — HTTP Adapter | Not started | ADP-01~02 | Ready to plan |
| 4 — Model Management | Not started | MOD-01~02 | Ready to plan |
| 5 — AI Planner | Not started | AI-01~02 | Blocked by Phase 4 |
| 6 — Frontend IPC Migration | Not started | IPC-01~03 | Blocked by Phases 2-5 |
| 7 — Distribution | Not started | DST-01~04 | Blocked by Phase 6 |
| 8 — Cleanup | Not started | CLN-01 | Blocked by Phase 7 |

---

## Performance Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Requirements mapped | 25/25 ✓ | 100% |
| Requirements complete | 5/25 | 20% |
| Phases defined | 8 | 8 |
| Phases complete | 2/8 | 25% |
| Electron backend files remaining | ~15 | 0 |
| Rust backend files to write | 0 | ~25 |
| Rust backend files written | ~20 | <25 |

---

## Accumulated Context

### Key Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| D-01 | 8-phase structure with parallelizable Phases 2-4 | TTS/Adapter/Model have no interdependencies; parallel execution possible |
| D-02 | CI/CD deferred from Phase 1 | User decision — Phase 1 focuses on local dev only |
| D-03 | FND-06 moved back to later phase | CI/CD will be added in a future phase |
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

- Phase 2 (TTS Engine) execution completed
- 4 plans executed: foundation → providers → wiring → frontend test
- 14 Rust source files created/updated
- 5 TTS requirements satisfied (TTS-01~05)
- 2 deviations: tokio dependency, abort flag propagation fix

### Next Action

Proceed to Phase 3: HTTP Adapter (axum on :18765) or Phase 4: Model Management. Phases 2-4 can execute in parallel.

```
Phase 1: Foundation → cargo tauri dev, frameless window, tray, logging, single instance (CI/CD deferred) ✅
Phase 2: TTS → system/local/cloud providers, queue, Channel streaming ✅
Phase 3: Adapter → axum :18765, graceful shutdown
Phase 4: Model → import, walkdir scan, registry
Phase 5: AI → reqwest OpenAI, function calling, rule/ai/hybrid modes
Phase 6: IPC → tauri-adapter.ts, migrate components, remove preload
Phase 7: Distribution → updater, signing, .dmg/.msi/.AppImage
Phase 8: Cleanup → remove all Electron/Node.js
```

---

*Last updated: 2026-05-10 after Phase 2 TTS Engine execution*
