# Phase 6: Frontend IPC Migration — Context

**Gathered:** 2026-05-10
**Status:** Ready for planning
**Mode:** Agent discretion

<domain>
## Phase Boundary

将所有前端组件从 `window.electronAPI` 切换到 `@tauri-apps/api`。创建适配层，逐组件迁移，移除 Electron IPC 代码。

**Requirements:** IPC-01 (tauri-adapter.ts), IPC-02 (component migration), IPC-03 (cleanup)

</domain>

<decisions>
## Implementation Decisions

### the agent's Discretion
- Create `src/tauri-adapter.ts` mirroring old `electronAPI` interface
- Migrate components one-by-one: pet-store → App.tsx → PetStage → SpeechBubble → model-registry → behavior-planner
- TTS audio: Tauri Channel integration with StreamingAudioPlayer
- Adapter events: Tauri event `listen()` instead of `onPetEvent`
- After migration: remove preload.ts, all `window.electronAPI` refs, Electron types
- Update vite.config.mts if needed for Tauri dev

</decisions>

<canonical_refs>
- `.planning/REQUIREMENTS.md` — IPC-01, IPC-02, IPC-03
- `.planning/ROADMAP.md` §Phase 6 — Success criteria
- `apps/desktop/electron/preload.ts` — Current IPC surface (full API)
- `apps/desktop/src/` — All frontend files needing migration
- `apps/desktop/src/stores/pet-store.ts` — State management (needs Tauri invoke)
- `apps/desktop/src/App.tsx` — Event routing (needs Tauri events)
</canonical_refs>

---

*Phase: 6-Frontend-IPC*
*Context gathered: 2026-05-10*
