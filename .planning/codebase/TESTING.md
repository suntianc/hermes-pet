# Testing: Hermes DeskPet

> Last updated: 2026-05-08

## Current State

**No test infrastructure or test files exist in the codebase.**

- No test framework installed (no Jest, Vitest, Mocha, etc. in any `package.json`)
- No `test` script defined in any `package.json`
- No `*.test.*` or `*.spec.*` files found anywhere
- No `tests/` or `__tests__/` directories exist

## CI Pipeline

The GitHub Actions CI (`ci.yml`) only runs a **build-only** pipeline:

```
Install → Build packages → Build desktop → Upload artifacts
```

No linting, type checking, or test steps are included.

## Verification Approach

Currently, verification relies on:

1. **TypeScript compilation**: `tsc` is run as part of the build process (both main and renderer). `strict: true` catches type errors.
2. **Runtime testing**: Manual testing via:
   - `npm run dev` (renderer + main process watch)
   - `curl` commands against the Adapter API (`POST /adapter`, `GET /adapter/capabilities`)
   - Manual tray menu interaction
3. **Lint command**: `npm run lint` defined as `turbo run lint` but no ESLint config found

## Missing Testing Infrastructure

| Area | Gap |
|------|-----|
| Unit tests | No test framework |
| Integration tests | No test for IPC handlers, adapter API, TTS pipeline |
| E2E tests | No Playwright/Spectron for Electron |
| Component tests | No React Testing Library for renderer components |
| Snapshot tests | Not applicable yet |
| Coverage reporting | Not configured |

## Recommended Test Strategy

### Unit Testing
- **Framework**: Vitest (works naturally with Vite, same module resolution)
- **Priority files for unit tests**:
  - `electron/adapter/normalize.ts` — event normalization logic
  - `electron/adapter/policy.ts` — phase→action mapping
  - `electron/tts/text-utils.ts` — text splitting logic
  - `electron/tts/tts-config.ts` — config persistence
  - `src/features/pet-events/behavior-planner.ts` — rule planner logic
  - `src/features/pet-events/pet-event-schema.ts` — event validation
  - `src/features/pet-events/behavior-plan.ts` — plan composition
  - `src/stores/pet-store.ts` — state management logic

### Integration Testing
- Adapter API: HTTP endpoint tests with mock HTTP requests
- IPC handlers: Test `ipc.ts` handler logic (mock `BrowserWindow`)
- AI Planner: Test `ai-planner.ts` with mock OpenAI client

### E2E Testing
- Spectron or Playwright for full Electron app testing
- Model import flow
- TTS audio pipeline
- Tray menu actions

## Test-friendly Patterns (Already Present)

- **Singleton services**: `getAIPlannerService()`, `getTTSManager()`, `getPetWindow()` — easily mockable via getter substitution
- **Pure functions**: `normalizeAgentEvent()`, `toPetStateEvent()`, `splitText()` — no side effects, easy to unit test
- **Result objects**: `{ ok, plan, error }` pattern — easy to assert on
- **Config objects**: Injected rather than imported statically

## GitHub Issues & Test Files

- No `.github/ISSUE_TEMPLATE/` exists
- No test-related tooling or scripts configured
- No `.eslintrc` or ESLint config found (lint command references ESLint but no config file)
