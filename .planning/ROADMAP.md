# Roadmap: Hermes DeskPet — Milestone 2

**Project:** Hermes DeskPet — Electron → Tauri 2 + Rust Migration
**Phases:** 8 | **Requirements:** 25 mapped | All v1 requirements covered ✓
**Granularity:** Fine | **Parallelization:** Enabled

---

## Phases

- [ ] **Phase 1: Foundation** — Tauri 2 scaffold, window, tray, logging, single instance, CI/CD
- [ ] **Phase 2: TTS Engine** — 3-provider TTS queue management and audio streaming to WebView
- [ ] **Phase 3: HTTP Adapter** — Embedded axum server on port 18765 with graceful shutdown
- [ ] **Phase 4: Model Management** — .riv file import, directory scanning, model registry
- [ ] **Phase 5: AI Planner** — OpenAI client with function calling and three planning modes
- [ ] **Phase 6: Frontend IPC Migration** — All components from `window.electronAPI` to `@tauri-apps/api`
- [ ] **Phase 7: Distribution** — Auto-update, cross-platform builds, code signing
- [ ] **Phase 8: Cleanup** — Remove all Electron/Node.js dependencies and code

---

## Phase Details

### Phase 1: Foundation
**Goal**: Tauri 2 project is scaffolded with working window, tray, logging, single instance, and CI/CD pipeline
**Depends on**: Nothing
**Requirements**: FND-01, FND-02, FND-03, FND-04, FND-05, FND-06
**Success Criteria** (what must be TRUE):
1. Developer can run `cargo tauri dev` and see a frameless transparent window anchored to bottom-right
2. System tray icon appears with Show/Hide and Quit options working
3. Second app instance focuses the existing window instead of creating a duplicate
4. Rust tracing log messages (info/warn/error) appear in the configured log file
5. CI pipeline (GitHub Actions) builds the app for macOS (arm64+x64), Windows (x64), and Linux (x64)
6. Frontend can invoke a Tauri command via `@tauri-apps/api` and receive a response
**Plans**: TBD

### Phase 2: TTS Engine
**Goal**: All three TTS providers (system/local/cloud) work in Rust, audio streams to WebView via Channel
**Depends on**: Phase 1
**Requirements**: TTS-01, TTS-02, TTS-03, TTS-04, TTS-05
**Success Criteria** (what must be TRUE):
1. User can trigger system TTS (macOS `say` / Windows SAPI / Linux espeak-ng) and hear spoken output
2. User can switch TTS provider (system/local/cloud) and settings persist across app restarts
3. Long text (>500 chars) is automatically split into chunks and queued FIFO with sequential playback
4. Audio chunks stream from Rust → WebView via Tauri Channel and play through Web Audio API with real-time RMS analysis
5. Rive pet's mouth animation (`mouth_open` input) syncs with TTS audio amplitude (target <200ms latency)
**Plans**: TBD

### Phase 3: HTTP Adapter
**Goal**: Embedded axum HTTP server on port 18765 accepts external Agent events and forwards to WebView
**Depends on**: Phase 1
**Requirements**: ADP-01, ADP-02
**Success Criteria** (what must be TRUE):
1. `curl -X POST http://localhost:18765/adapter -H "Content-Type: application/json" -d '{"agent":"test","phase":"thinking"}'` returns HTTP 200
2. `curl http://localhost:18765/adapter/capabilities` returns JSON with available phases and features
3. Adapter server shuts down cleanly when app exits (verified by port release, no orphan processes)
4. Events posted to `/adapter` arrive in WebView as Tauri events and trigger pet animation changes
**Plans**: TBD

### Phase 4: Model Management
**Goal**: Users can import .riv model files and the app automatically indexes all available models
**Depends on**: Phase 1
**Requirements**: MOD-01, MOD-02
**Success Criteria** (what must be TRUE):
1. User can open a native file dialog, select a .riv file, and have it imported to the app data directory
2. App automatically scans the models directory (walkdir) and builds/updates `models.json` registry
3. Frontend can invoke the `model_list` Tauri command and receive available models (built-in + user-imported)
**Plans**: TBD

### Phase 5: AI Planner
**Goal**: OpenAI-driven pet behavior planning with three operational modes, all in Rust
**Depends on**: Phase 4
**Requirements**: AI-01, AI-02
**Success Criteria** (what must be TRUE):
1. Frontend can invoke AI planner with an event description and receive a structured action plan
2. AI planner supports OpenAI function calling (tools API) for structured action selection
3. User can switch between rule, ai, and hybrid modes with mode persisted across app restarts
4. OpenAI API key is configurable and stored in app config via tauri-plugin-store
**Plans**: TBD

### Phase 6: Frontend IPC Migration
**Goal**: All frontend communication goes through `@tauri-apps/api`; zero Electron IPC remains
**Depends on**: Phases 2, 3, 4, 5
**Requirements**: IPC-01, IPC-02, IPC-03
**Success Criteria** (what must be TRUE):
1. `src/tauri-adapter.ts` exists as an abstraction layer mirroring the old `window.electronAPI` interface
2. All React components (App.tsx, PetStage, SpeechBubble, pet-store.ts) use `@tauri-apps/api` invoke/events
3. TTS audio flow works end-to-end: Rust TTS → Channel → StreamingAudioPlayer → Rive lip sync
4. Adapter events flow end-to-end: curl POST → axum server → Tauri event → WebView handler → pet animates
5. `preload.ts` is deleted; zero `window.electronAPI` or Electron IPC references remain anywhere in the codebase
**Plans**: TBD
**UI hint**: yes

### Phase 7: Distribution
**Goal**: App is distributable on all three platforms with auto-update support and code signing
**Depends on**: Phase 6
**Requirements**: DST-01, DST-02, DST-03, DST-04
**Success Criteria** (what must be TRUE):
1. App checks for updates via `tauri-plugin-updater` with a custom React notification UI
2. macOS .dmg can be built, signed with Apple Developer ID, and notarized
3. Windows .msi can be built and signed with an Authenticode certificate
4. Linux .AppImage can be built
5. Updater artifacts (.sig, .tar.gz) are generated alongside distribution bundles
**Plans**: TBD

### Phase 8: Cleanup
**Goal**: Zero Electron/Node.js dependencies remain in the project
**Depends on**: Phase 7
**Requirements**: CLN-01
**Success Criteria** (what must be TRUE):
1. `package.json` contains no `electron`, `electron-builder`, `electron-log`, or `openai` npm dependencies
2. `electron/` directory and all Electron-specific config files (electron-builder.yml, etc.) are removed
3. Dev/build scripts in `package.json` use only Tauri commands; no electron-related scripts remain
4. `npm run dev` starts the Tauri dev server; `npm run build` produces a Tauri bundle
5. Full project builds and packages successfully with zero Node.js backend dependency
**Plans**: TBD

---

## Dependency Graph

```
Phase 1: Foundation
  ├── Phase 2: TTS Engine (parallel with 3, 4)
  ├── Phase 3: HTTP Adapter (parallel with 2, 4)
  └── Phase 4: Model Management (parallel with 2, 3)
        └── Phase 5: AI Planner (depends on 4)
              └── Phase 6: Frontend IPC (depends on 2, 3, 4, 5)
                    └── Phase 7: Distribution (depends on 6)
                          └── Phase 8: Cleanup (depends on 7)
```

---

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1 — Foundation | 0/0 | Not started | - |
| 2 — TTS Engine | 0/0 | Not started | - |
| 3 — HTTP Adapter | 0/0 | Not started | - |
| 4 — Model Management | 0/0 | Not started | - |
| 5 — AI Planner | 0/0 | Not started | - |
| 6 — Frontend IPC Migration | 0/0 | Not started | - |
| 7 — Distribution | 0/0 | Not started | - |
| 8 — Cleanup | 0/0 | Not started | - |

---

*Roadmap created: 2026-05-09 for Milestone 2 — Electron → Tauri 2 + Rust Migration*
