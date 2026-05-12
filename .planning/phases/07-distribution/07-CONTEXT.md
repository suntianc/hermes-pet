# Phase 7: Distribution — Context

**Gathered:** 2026-05-10
**Status:** Ready for planning
**Mode:** Agent discretion

<domain>
## Phase Boundary

Auto-update, cross-platform builds, code signing. Make the app distributable on all three platforms.

**Requirements:** DST-01 (auto-update + frontend UI), DST-02 (macOS .dmg + sign), DST-03 (Windows .msi), DST-04 (Linux .AppImage)

</domain>

<decisions>
## Implementation Decisions

### the agent's Discretion
- Auto-update via tauri-plugin-updater with custom React update notification
- macOS: .dmg build + Apple Developer ID signing + notarization config
- Windows: .msi build + Authenticode signing config
- Linux: .AppImage build
- Update artifacts management: .sig + .tar.gz generation
- GitHub Actions workflow for release automation

</decisions>

<canonical_refs>
- `.planning/REQUIREMENTS.md` — DST-01~04
- `.planning/ROADMAP.md` §Phase 7 — Success criteria
- `apps/desktop/src-tauri/tauri.conf.json` — Existing config
- `apps/desktop/src-tauri/Cargo.toml` — Existing deps
</canonical_refs>

---

*Phase: 7-Distribution*
*Context gathered: 2026-05-10*
