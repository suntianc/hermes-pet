# Phase 4: Model Management — Context

**Gathered:** 2026-05-10
**Status:** Ready for planning
**Mode:** Agent discretion

<domain>
## Phase Boundary

Rust 模型管理系统：.riv 文件导入、目录扫描、模型注册表。

**Requirements:** MOD-01 (import via dialog), MOD-02 (directory scanning + registry)

</domain>

<decisions>
## Implementation Decisions

### the agent's Discretion
- Import: tauri-plugin-dialog file picker (.riv filter) → copy to app data dir
- Scanning: walkdir crate for recursive .riv discovery
- Registry: JSON file (models.json) in app data dir
- Built-in models bundled via tauri.conf.json resources
- Frontend-facing commands: model_list, model_import, model_remove

</decisions>

<canonical_refs>
- `.planning/REQUIREMENTS.md` — MOD-01, MOD-02
- `.planning/ROADMAP.md` §Phase 4 — Success criteria
- `apps/desktop/electron/model-manager.ts` — Current implementation (reference)
- `apps/desktop/src/features/pet/model-registry.ts` — Frontend model loading
</canonical_refs>

---

*Phase: 4-Model-Management*
*Context gathered: 2026-05-10*
