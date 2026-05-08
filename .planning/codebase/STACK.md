# Stack: Hermes DeskPet

> Last updated: 2026-05-08

## Languages

- **TypeScript** (5.5.2): 100% of application code (both main process and renderer)
- No other languages (JavaScript, CSS minimal)

## Runtime

- **Electron 41.5.0**: Desktop shell with Chromium renderer
- **Node.js >=18**: Required by Electron
- **Process model**: Two-process architecture (main + sandboxed renderer)
- **Build targets**: macOS (primary), Windows, Linux (electron-builder config)

## Package Manager & Monorepo

- **Yarn 1.22.22** (classic) workspaces
- **Turborepo**: Task orchestration (`turbo.json`)
- Root `package.json` delegates to workspace packages:
  - `apps/desktop` (`vivi-pet`) — the Electron desktop app
  - `packages/pet-action-dsl` (`@hermes/pet-action-dsl`) — action DSL types
  - `packages/shared` (`@hermes/shared`) — shared type definitions

## Desktop App Dependencies (`apps/desktop/package.json`)

### Runtime Dependencies
| Package | Version | Purpose |
|---------|---------|---------|
| `react` | ^19.2.3 | UI framework |
| `react-dom` | ^19.2.3 | React DOM renderer |
| `gsap` | ^3.15.0 | Animation library for Live2D |
| `openai` | ^6.36.0 | OpenAI API client (AI planner) |
| `extract-zip` | ^2.0.1 | Model package extraction |
| `electron-log` | ^5.1.7 | Logging (file + console) |

### Dev Dependencies
| Package | Version | Purpose |
|---------|---------|---------|
| `electron` | ^41.5.0 | Desktop shell |
| `typescript` | ^5.5.2 | TypeScript compiler |
| `vite` | ^5.3.1 | Renderer bundler |
| `concurrently` | ^8.2.2 | Run main+renderer dev in parallel |
| `@types/react` | ^19.2.14 | React type definitions |
| `@types/react-dom` | ^19.2.3 | ReactDOM type definitions |
| `@types/node` | ^20.14.2 | Node.js type definitions |
| `electron-builder` | ^26.8.1 | App packaging/distribution |

### Build Configuration

**Renderer (Vite):**
- Entry: `src/index.html`
- Root: `src/`
- Out: `dist/renderer/`
- Public dir: `public/` (static assets: Live2D models, shaders, Cubism Core WASM)
- Aliases: `@` → `src/`, `@framework` → `src/vendor/cubism`, `@pet-action-dsl` → `../../packages/pet-action-dsl/src`, `@shared` → `../../packages/shared/src`

**Main Process (tsc):**
- Config: `tsconfig.main.json`
- Target: CommonJS ES2022
- Entry dir: `electron/`
- Out dir: `dist/main/`
- No bundler — raw tsc compilation

## Live2D Cubism 5 SDK

- Cubism Core WASM (`public/live2dcubismcore.js`)
- WebGL shaders (`public/Framework/Shaders/WebGL/`)
- Framework source vendored at `src/vendor/cubism/` (aliased as `@framework`)

## CI/CD

- **CI**: GitHub Actions (`ci.yml`) — builds on macos-latest, Node 20
  - Trigger: push to main, PR to main
  - Steps: install → build packages → build desktop → upload dist artifacts
  - Concurrency: cancels in-progress runs on same branch
- **Release**: `.github/workflows/release.yml` (distribution build)

## Packaging

- **electron-builder v26.8.1**
- `electron-builder.yml` config:
  - App ID: `com.vivipet.app`
  - Product name: `ViviPet`
  - macOS targets: dmg, zip
  - Windows targets: nsis
  - Linux targets: AppImage, deb, tar.gz
  - Extra resources: `assets/`, `public/models/`
  - One-click installer on Windows (configurable)
