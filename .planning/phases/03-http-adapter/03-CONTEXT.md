# Phase 3: HTTP Adapter — Context

**Gathered:** 2026-05-10
**Status:** Ready for planning
**Mode:** Agent discretion

<domain>
## Phase Boundary

Embedded axum HTTP server on port 18765 for external Agent event integration.

**Requirements:** ADP-01 (axum server + endpoints), ADP-02 (graceful shutdown)

</domain>

<decisions>
## Implementation Decisions

### the agent's Discretion
- axum server spawned via `tauri::async_runtime::spawn()` on shared tokio runtime
- CancellationToken for graceful shutdown, triggered from `on_event(RunEvent::Exit)`
- Two endpoints: POST /adapter, GET /adapter/capabilities
- Events forwarded to WebView via `app_handle.emit("pet:event", payload)`
- Port configurable via env var `VIVIPET_ADAPTER_PORT` (default 18765)
- Incoming events normalized to PetStateEvent (reuse existing adapter protocol from Electron)
- Error handling: structured JSON error responses

</decisions>

<canonical_refs>
- `.planning/REQUIREMENTS.md` — ADP-01, ADP-02
- `.planning/ROADMAP.md` §Phase 3 — Success criteria
- `.planning/research/milestone2/ARCHITECTURE.md` — Axum lifecycle
- `.planning/research/milestone2/PITFALLS.md` — P-02 (axum lifecycle on shutdown)
- `apps/desktop/electron/adapter/server.ts` — Current adapter (reference)
- `apps/desktop/electron/adapter/protocol.ts` — Event types (reference)
</canonical_refs>

---

*Phase: 3-HTTP-Adapter*
*Context gathered: 2026-05-10*
