# Phase 4: Model System Adaptation - Research

**Researched:** 2026-05-08
**Domain:** Rive .riv model management, import flow, protocol, indexing
**Confidence:** HIGH

## Summary

Phase 4 adapts the model management system to support Rive `.riv` files after the Live2D→Rive migration. The phase is primarily about wiring: `model-manager.ts` has stubs from Phase 3 that need real `.riv`-capable implementations, `indexBundledModels` needs a `.riv` skip guard, `electron-builder.yml` has a dangling reference to a deleted directory, and a documentation file needs to exist so users know how to integrate their own `.riv` models.

The vivipet-assets:// protocol is a verified keeper — it works, has path traversal protection, and serves user-imported `.riv` files to the renderer via `fetch()`. The SQLite `action-index.ts` module stays (as decided), with indexing skipped for `.riv` paths. The preload.ts API surface needs zero interface changes — only the underlying implementations change.

**Primary recommendation:** Touch 5 files (model-manager.ts, electron-builder.yml, new `.vivipet-registry.json` concept, new RIVE_MODEL_INTEGRATION.md, models.json stays empty). No new dependencies needed.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
#### vivipet-assets 协议 (MODEL-04)
- **D-01:** 保留 vivipet-assets:// 协议 — 已实现且正常工作，有路径穿越防护，渲染器可通过 fetch + ArrayBuffer 传给 Rive
- **D-02:** initModelProtocol 在 electron/main.ts 中保持注册，model-manager.ts 中的协议处理逻辑不变
- **D-03:** 用户导入的 .riv 模型通过 vivipet-assets:// 提供（如 `vivipet-assets://models/<id>/model.riv`）

#### 模型导入流程 (MODEL-03)
- **D-04:** `importModelViaDialog()` 改为 .riv 文件选择器 — `filters: [{ name: 'Rive Model (.riv)', extensions: ['riv'] }]`
- **D-05:** 用户选择 .riv 文件后，复制到 `userData/models/<modelId>/` 目录，写入 `.vivipet-registry.json`
- **D-06:** `importModelZip()` 函数可以删除（extract-zip 已移除），替换为 `importRiveModel()` 处理单文件复制
- **D-07:** `listUserModels()` 从 stub 改为扫描 `userData/models/` 下的 `.vivipet-registry.json`，返回 .riv 模型配置

#### Rive 动作映射约定 (MODEL-02)
- **D-08:** Rive .riv 模型不触发 SQLite 动作索引 — `indexBundledModels` 应检查 path 扩展名为 `.riv` 时跳过
- **D-09:** .riv 模型的动画由 Rive State Machine 自动管理，无需外部索引
- **D-10:** SM 输入命名约定在文档中说明（`rive-inputs.ts` 常量：state/mouth_open/look_x/look_y/blink/breathe）
- **D-11:** SQLite `action-index.ts` 保留不动（MODEL-02 要求）

#### 默认模型
- **D-12:** 准备默认模型基建 — `public/assets/models/models.json` 留空 `"models": []`
- **D-13:** `FALLBACK_MODELS` 留空（已在 Phase 3 清理）
- **D-14:** RiveRenderer 在没有模型时显示 fallback 文字提示（已有 `!modelLoaded` 状态处理）
- **D-15:** 用户准备好 .riv 后，将其放入 `public/models/` 并在 `models.json` 中添加条目即可

#### electron-builder.yml 修复
- **D-16:** 移除 `electron-builder.yml` 中 `public/models` 的 extraResources 引用（Phase 3 已删除该目录）
- **D-17:** 未来添加 .riv 模型后在 Phase 4 更新此配置

#### 用户文档 (MODEL-05)
- **D-18:** 创建轻量 README 风格文档 `RIVE_MODEL_INTEGRATION.md`（或作为 PROJECT.md 的一部分）
- **D-19:** 文档内容：`rive-inputs.ts` 常量表、SM 输入命名约定、.riv 文件放置位置、models.json 配置方式、vivipet-assets 协议说明
- **D-20:** 提供示例 models.json 配置模板（参考 Phase 1 CONTEXT.md 的模型加载架构）

#### Verification
- **D-21:** 启动应用确认 vivipet-assets 协议正确初始化
- **D-22:** 确认 RiveRenderer 在没有 .riv 文件时显示 fallback 而非报错
- **D-23:** 确认 SQLite 索引不对 .riv 路径运行
- **D-24:** 确认 electron-builder 打包不因 extraResources 缺失失败

### the agent's Discretion
- `models.json` 中 .riv 条目的具体 schema — 可参考 Phase 1 的路径/窗口配置，但 actions/capabilities 可以简化或省略（Rive SM 处理）
- 用户模型目录的命名策略（modelId 生成规则）
- 文档文件的具体位置（`docs/` 或项目根目录）

### Deferred Ideas (OUT OF SCOPE)
- 默认 .riv 模型文件 — 用户自行制作后放入（D-15）
- `electron-builder.yml` extraResources 中 .riv 模型的引用 — 用户添加模型后更新
- Rive Data Binding / ViewModel — 不在规划范围内

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MODEL-01 | Model registry supports `.riv` model type | Already complete — `ModelType = 'rive'` in model-registry.ts l.1. No changes needed. |
| MODEL-02 | Deprecate action-index for Rive models | Guard in `indexBundledModels()` to skip `.riv` paths. SQLite retains full structure. |
| MODEL-03 | Update model import flow for `.riv` files | Rewrite `importModelViaDialog`/`importRiveModel`/`listUserModels` in model-manager.ts |
| MODEL-04 | Clean up vivipet-assets:// protocol if no longer needed | Confirmed needed — protocol stays. electron-builder.yml fix for dangling reference only. |
| MODEL-05 | Provide user Rive model integration docs | Create RIVE_MODEL_INTEGRATION.md with SM inputs table, file placement, models.json template |

</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Model file serving (vivipet-assets) | Main Process | — | Custom protocol handler registered in main, security (path traversal) enforced at the OS process boundary |
| Model import (file dialog + copy) | Main Process | — | Requires `dialog` API (Electron only), filesystem access |
| Model registry loading + merging | Renderer | Main Process | Loads models.json + IPC `listUserModels`, merges client-side |
| SQLite action indexing | Main Process | — | `node:sqlite` not available in sandboxed renderer |
| .riv animation playback | Renderer | — | Rive WASM operates in renderer canvas context |
| User documentation | — | Project root | Static markdown file, no tier ownership |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @rive-app/canvas | ^2.37.5 | Rive .riv rendering | Primary renderer, already installed and verified in Phase 1-3 |
| electron | ^41.5.0 | Desktop framework | `dialog`, `protocol.handle`, `net.fetch` APIs used for import/serving |
| electron-log | ^5.1.7 | Logging | Already standard in project |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| node:sqlite | Built-in Node 22+ | SQLite for action index | Stays for future use, .riv models skip it (D-08/D-11) |

### Alternatives Considered
Note: No new libraries introduced in this phase. Phase 4 is purely wiring of existing code.

**Installation:** No new npm packages needed.

## Architecture Patterns

### System Architecture Diagram

The model management system has two distinct flows — built-in models and user-imported models — that converge at the renderer:

```
BUILT-IN MODEL FLOW:
  public/assets/models/models.json         (empty: "models": [])
        │
        ▼
  loadModelConfigs() (model-registry.ts:67)
        │
        ├── indexBundledModels() ──→ .riv? → SKIP SQLite index
        │                              yes   → log skip, no-op
        │
        ▼
  merged model list → PetStage → RiveRenderer.loadModel()
                                    │
                                    ▼
                              fetch(path) → ArrayBuffer
                                    │
                                    ▼
                              new Rive({ buffer })


USER-IMPORTED MODEL FLOW:
  Tray: "Import Model..."
        │
        ▼
  IPC pet:model:import ──→ importModelViaDialog()
                                │
                                ▼
                          dialog.showOpenDialog(.riv)
                                │
                                ▼
                          importRiveModel(rivFilePath)
                                │
                          ├── fs.mkdirSync(userData/models/<id>/)
                          ├── fs.copyFileSync( → model.riv)
                          ├── fs.writeFileSync(.vivipet-registry.json)
                          │
                          ▼
                          return model config ──→ App.tsx → modelRevision++

Model registry merge (renderer):
  loadModelConfigs()
        │
  ├── fetch(models.json) → builtIn models (currently empty)
  ├── IPC listUserModels → .vivipet-registry.json scan → user models  
  │       │
  │       ▼
  │   scan userData/models/*/.vivipet-registry.json
  │   → parse each → array of ModelConfig
  │
  ▼
  merge (user overrides built-in by id)
        │
        ▼
  PetStage renders
```

### Recommended Project Structure
```
apps/desktop/
├── electron/
│   ├── model-manager.ts       # ★ MODIFIED: importRiveModel, listUserModels, skip .riv in indexBundledModels
│   ├── action-index.ts        # Unchanged — SQLite stays intact
│   ├── ipc.ts                 # Unchanged — IPC handlers reference model-manager.ts functions
│   ├── preload.ts             # Unchanged — petModel API surface works as-is
│   └── main.ts                # Unchanged — initModelProtocol + initActionIndex stay
├── src/
│   └── features/pet/
│       ├── model-registry.ts   # Unchanged — already supports 'rive' type
│       └── rive-inputs.ts      # Ref documented in RIVE_MODEL_INTEGRATION.md
├── electron-builder.yml        # ★ MODIFIED: remove public/models extraResources
├── public/assets/models/
│   └── models.json             # Unchanged (stays empty per D-12)
├── RIVE_MODEL_INTEGRATION.md   # ★ NEW: user documentation
└── docs/                       # Alternative location for RIVE_MODEL_INTEGRATION.md
```

### Pattern 1: .riv File Import Flow
**What:** Single-file copy + metadata registry for user-imported `.riv` models
**When to use:** User clicks "Import Model..." in tray menu
**Implementation sketch:**
```
1. dialog.showOpenDialog({ filters: [{ name: 'Rive Model (.riv)', extensions: ['riv'] }] })
2. Generate modelId via existing toModelId(name) function
3. Create userData/models/<modelId>/ directory (recursive)
4. fs.copyFileSync(rivPath, userData/models/<modelId>/model.riv)
5. Write .vivipet-registry.json:
   { "id": "<modelId>", "name": "<original filename>", "path": "vivipet-assets://models/<modelId>/model.riv", "type": "rive" }
6. Return { id, name, path, window: { width: 520, height: 760 } }
```

### Pattern 2: User Model Discovery
**When to use:** `listUserModels()` called during model registry loading
**Implementation sketch:**
```
1. Scan userData/models/ for subdirectories
2. For each subdirectory, look for .vivipet-registry.json
3. Parse and collect into array
4. Return array
```

### Pattern 3: Skip .riv During Bundled Indexing
**When to use:** `indexBundledModels()` processes model paths
**Implementation:**
```
if (model.path.endsWith('.riv')) {
  log.info(`[ModelManager] Skipping SQLite index for Rive model: ${model.id}`);
  continue;
}
// ... existing indexModelActions() call for non-.riv paths
```

### Anti-Patterns to Avoid
- **Adding SQLite entries for .riv models:** Rive State Machine manages animation internally; no external index needed. The `.riv` skip guard must be explicit.
- **Trying to share the same import flow for .zip and .riv:** They are fundamentally different — .zip was multi-file with extraction, .riv is single file with registry. Keep them as separate functions.
- **Assuming models.json is the only source of models:** User-imported models via `.vivipet-registry.json` are merged at runtime. Always merge with `listUserModels()` results.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Custom protocol for serving local files | Manual file read + base64 encoding | `protocol.handle('vivipet-assets', ...)` + `net.fetch()` | Already built, path traversal protected, works with `fetch()` in renderer |
| File dialog for model selection | Custom UI picker | `dialog.showOpenDialog()` | Native OS dialog, Electron built-in, handles accessibility |
| Model animation state machine | Custom animation engine | Rive State Machine | .riv files embed SM with trigger/number inputs; just set input values |
| User model metadata storage | Custom database | `.vivipet-registry.json` per model directory | Simpler than SQLite for flat metadata, git-friendly, removable by deleting directory |

**Key insight:** No hand-roll risks in this phase. All patterns leverage existing Node.js/Electron built-ins or Rive's embedded SM. The most "build" decision is the `.vivipet-registry.json` format — keep it minimal since it replaces the SQLite indexing that Live2D required.

## Common Pitfalls

### Pitfall 1: Path Resolution for Built-in Models
**What goes wrong:** `resolveBundledModelPath()` in model-manager.ts checks a hardcoded set of candidates (`isPackaged ? process.resourcesPath : app.getAppPath() + 'public/'`). If a built-in `.riv` model path in `models.json` doesn't match, it fails silently and the model never gets indexed (or skipped if .riv).
**Why it happens:** `resolveBundledModelPath()` returns `null` if no candidate file exists. The `indexBundledModels` loop has `if (!modelPath) continue;` — silent skip.
**How to avoid:** Ensure built-in `.riv` model paths in `models.json` are relative to `public/` (e.g., `/models/my-pet/model.riv`). The RiveRenderer's `fetchModel()` uses the path directly as a URL — verify it resolves correctly in both dev (`dev:renderer` on :5173) and packaged mode.
**Warning signs:** Models not appearing in the list, no error in console.

### Pitfall 2: .riv Skip Guard Too Broad
**What goes wrong:** The skip guard in `indexBundledModels` uses `path.endsWith('.riv')`. If a non-model path happens to end with `.riv`, it would also be skipped.
**Why it happens:** Simple string check without context.
**How to avoid:** The guard is at the `BundledModelConfig` level — check `model.path` on the config object, before any filesystem resolution. This is correct because the path field is the model's file path, not an intermediate artifact.
**Warning signs:** N/A — false positive is impossible since `model.path` is always a model file path.

### Pitfall 3: dialog.showOpenDialog returns canceled result on macOS
**What goes wrong:** On macOS, if the user opens the dialog and closes it without selecting, `result.canceled` is true but `result.filePaths` array may exist.
**Why it happens:** macOS dialog behavior.
**How to avoid:** Always check `result.canceled` first, and also check `result.filePaths.length === 0`. The current code in `importModelViaDialog()` already does both.

### Pitfall 4: electron-builder.yml extraResources path
**What goes wrong:** `electron-builder.yml` still references `public/models` (line 12-13) which was deleted in Phase 3. Electron-builder may or may not warn about this, and the behavior depends on builder version.
**Why it happens:** Phase 3 deferred the fix to Phase 4 per deferred decisions.
**How to avoid:** Simply remove the two lines referencing `public/models`. Keep the `assets/` extraResources line.
**Warning signs:** Build warnings or packaging errors.

### Pitfall 5: .vivipet-registry.json Read Errors
**What goes wrong:** `listUserModels()` calls `JSON.parse()` on each `.vivipet-registry.json`. If a user manually edits/corrupts the file, parsing fails mid-scan.
**Why it happens:** No try/catch around individual file reads.
**How to avoid:** Wrap each registry file read in try/catch, log the error, and continue scanning. One bad registry should not block all user models.

## Code Examples

Verified patterns from official sources:

### Model Config Example (models.json entry for .riv)
```json
{
  "models": [
    {
      "id": "my-pet",
      "name": "My Pet",
      "path": "/models/my-pet/model.riv",
      "type": "rive",
      "window": {
        "width": 520,
        "height": 760
      }
    }
  ]
}
```

### .vivipet-registry.json Format (user-imported model metadata)
```json
{
  "id": "imported_pet_abc123",
  "name": "My Custom Pet",
  "path": "vivipet-assets://models/imported_pet_abc123/model.riv",
  "type": "rive",
  "window": {
    "width": 520,
    "height": 760
  }
}
```

### Safe File Copy Pattern (for importRiveModel)
```typescript
// Source: Node.js fs module (no external dep needed)
const modelDir = path.join(app.getPath('userData'), 'models', modelId);
fs.mkdirSync(modelDir, { recursive: true });
fs.copyFileSync(sourceRivPath, path.join(modelDir, 'model.riv'));
fs.writeFileSync(
  path.join(modelDir, '.vivipet-registry.json'),
  JSON.stringify({
    id: modelId,
    name: displayName,
    path: `vivipet-assets://models/${modelId}/model.riv`,
    type: 'rive',
  }, null, 2),
);
```

### .riv Skip in indexBundledModels
```typescript
export function indexBundledModels(models: BundledModelConfig[]): void {
  for (const model of models) {
    // D-08: Skip .riv models — Rive SM handles animation internally
    if (model.path.endsWith('.riv')) {
      log.info(`[ModelManager] Skipping SQLite index for Rive model: ${model.id}`);
      continue;
    }

    const modelPath = resolveBundledModelPath(model.path);
    if (!modelPath) continue;

    indexModelActions({
      modelId: model.id,
      name: model.name,
      modelPath,
      rootDir: path.dirname(modelPath),
    });
  }
}
```

### User Model Directory Scanner (for listUserModels)
```typescript
export function listUserModels(): Array<{
  id: string; name: string; path: string;
  window?: { width: number; height: number };
}> {
  const modelsDir = path.join(app.getPath('userData'), USER_MODELS_DIR);
  if (!fs.existsSync(modelsDir)) return [];

  const results: Array<{ id: string; name: string; path: string; window?: { width: number; height: number } }> = [];
  const entries = fs.readdirSync(modelsDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const registryPath = path.join(modelsDir, entry.name, '.vivipet-registry.json');
    if (!fs.existsSync(registryPath)) continue;

    try {
      const data = JSON.parse(fs.readFileSync(registryPath, 'utf-8'));
      if (data.id && data.name && data.path) {
        results.push({
          id: data.id,
          name: data.name,
          path: data.path,
          window: data.window,
        });
      }
    } catch (err) {
      log.warn(`[ModelManager] Failed to parse registry: ${registryPath}`, err);
    }
  }

  return results;
}
```

## Rive State Machine Inputs Reference (for Documentation)

From `src/features/pet/rive-inputs.ts`:

| Input Name | Type | Range | Purpose |
|------------|------|-------|---------|
| `state` | Number | 0-9 | Main animation state (0:idle, 1:thinking, 2:speaking, 3:happy, 4:error, 5:searching, 6:coding, 7:terminal, 8:confused, 9:angry) |
| `mouth_open` | Number | 0.0-1.0 | TTS lip sync amplitude (RMS-driven) |
| `look_x` | Number | -1.0-1.0 | Mouse horizontal position |
| `look_y` | Number | -1.0-1.0 | Mouse vertical position |
| `blink` | Trigger | fire | Blink animation trigger |
| `breathe` | Trigger | fire | Breathing animation trigger |

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| .model3.json + .motion3.json files parsed by SQLite index | Rive .riv with embedded State Machine | Phase 3-4 | No external indexing needed; SM inputs controlled directly by code |
| .zip model packages extracted via extract-zip | Single .riv file copy | Phase 4 | Simpler flow, fewer deps, no extraction step |
| model3.json action parsing (scanModelActions) | Skipped for .riv paths | Phase 4 | SQLite tables still created but stay empty for Rive models |

**Deprecated/outdated:**
- `importModelZip()` — Will be removed (was stub after Phase 3)
- `scanModelActions()` with `.model3.json` parsing (action-index.ts:128) — Still functional but only runs for non-.riv paths (currently none)

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `embedder-security` directive in `vite.config.mts` does NOT restrict `vivipet-assets://` URLs in fetch calls | Architecture | If CSP blocks custom protocol fetches, user models won't load |
| A2 | RiveRenderer.loadModel() fetch + ArrayBuffer approach works with both relative paths and `vivipet-assets://` absolute URLs | Architecture | Tested in Phase 1 but if protocol URLs need special CORS handling, fetch may fail |
| A3 | `electron-builder.yml` removal of `public/models` extraResources does NOT affect other builds already missing that directory | electron-builder.yml | If builder version 24+ treats missing `from` paths as error (not warning), packaging breaks |

## Open Questions (RESOLVED)

1. **[RESOLVED] Does electron-builder treat a missing `from` directory in extraResources as a warning or error?**
   - What we know: Directory was deleted in Phase 3, line still in electron-builder.yml
   - What's unclear: Builder's behavior — older versions warn, newer may error
   - Recommendation: Simply remove the lines (D-16). If current build fails, the fix is the removal itself.
   - Resolution: Remove the lines per D-16. Plan 04-02 Task 1.

2. **[RESOLVED] Where should RIVE_MODEL_INTEGRATION.md live?**
   - Options: `apps/desktop/RIVE_MODEL_INTEGRATION.md` (app-root), `docs/RIVE_MODEL_INTEGRATION.md` (project docs dir), project root `./RIVE_MODEL_INTEGRATION.md`
   - Recommendation: `apps/desktop/RIVE_MODEL_INTEGRATION.md` — it's a desktop-app-specific integration guide. Or `docs/` if the project has a docs convention.
   - Resolution: `apps/desktop/RIVE_MODEL_INTEGRATION.md` per Plan 04-02 Task 2.

3. **[RESOLVED] Should `listActions` be deprecated or removed from preload.ts?**
   - What we know: Returns empty for .riv models since no SQLite indexing
   - Recommendation: Keep it — the API doesn't break anything returning empty, and the handler stays in `ipc.ts`. No preload.ts changes needed.
   - Resolution: Keep as-is. No preload.ts changes needed for this phase.

## Environment Availability

> Skip this section — the phase has no external dependencies. All changes are code/config-only within the existing project.

## Validation Architecture

### Test Framework

No test framework currently exists in this project (no `tests/`, `__tests__/`, `*.test.*` files found). The Phase 4 plan should include manual verification steps as specified in D-21~D-24 rather than automated tests.

| Property | Value |
|----------|-------|
| Framework | None detected |
| Config file | N/A |
| Quick run command | `npm run build` (TypeScript compilation check) |
| Full suite command | `npm run build && npm start` (build + manual launch) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command |
|--------|----------|-----------|-------------------|
| MODEL-01 | ModelRegistry supports 'rive' type | Compile check | `npm run build` |
| MODEL-02 | .riv models skip SQLite indexing | Manual + log check | Build + launch, check console for skip message |
| MODEL-03 | .riv import via dialog works | Manual | Build + launch, "Import Model" from tray, select .riv |
| MODEL-04 | electron-builder.yml clean | Compile check | `npm run build` (should not error on missing dir) |
| MODEL-05 | RIVE_MODEL_INTEGRATION.md exists | Visual | Verify file exists |

### Sampling Rate
- **Per task commit:** `npm run build` (TypeScript compilation)
- **Phase gate:** Manual verification per D-21~D-24

### Wave 0 Gaps
- No test infrastructure exists — all verification is manual
- Add `npm run build` as minimum compilation check for each task

## Security Domain

> Required when `security_enforcement` is enabled (absent = enabled, and config.json does not set it to false).

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Desktop app, no user auth |
| V3 Session Management | no | Single-user desktop app |
| V4 Access Control | no | Local files only |
| V5 Input Validation | yes | Path traversal protection via `resolveSafeUserModelPath()` (already implemented) |
| V6 Cryptography | no | No data encryption needed for local model files |

### Known Threat Patterns for Electron Model Import

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Path traversal via protocol URL | Tampering | `resolveSafeUserModelPath()` check: `path.relative()` must not start with `..` [VERIFIED: model-manager.ts l.30-38] |
| Arbitrary file read via dialog | Tampering | OS `dialog.showOpenDialog` limits user selection; copy is restricted to `userData/models/<id>/` |
| Malformed registry.json parse crash | DoS | try/catch around `JSON.parse()`, per-registry error isolation |

## Sources

### Primary (HIGH confidence)
- [VERIFIED: codebase inspection] CONTEXT.md D-01~D-24 — All locked decisions verified against source files
- [VERIFIED: codebase inspection] model-manager.ts l.1-204 — Current state: importModelViaDialog (zip), importModelZip (stub), listUserModels (stub), indexBundledModels (no .riv guard)
- [VERIFIED: codebase inspection] action-index.ts l.1-188 — SQLite module intact, scanModelActions parses .model3.json
- [VERIFIED: codebase inspection] preload.ts l.17-35 — petModel API surface unchanged
- [VERIFIED: codebase inspection] ipc.ts l.108-127 — pet:model handlers unchanged
- [VERIFIED: codebase inspection] electron-builder.yml l.12-13 — Dangling `public/models` reference
- [VERIFIED: codebase inspection] model-registry.ts l.1 — `ModelType = 'rive'` already in place
- [VERIFIED: codebase inspection] RiveRenderer.ts l.63-123 — loadModel uses fetch(path) → ArrayBuffer → new Rive({ buffer })
- [VERIFIED: codebase inspection] PetStage.tsx l.440-454 — Fallback text when !modelLoaded or loadError
- [VERIFIED: codebase inspection] models.json — Empty `"models": []`
- [VERIFIED: codebase inspection] rive-inputs.ts — SM input constants (state, mouth_open, look_x, look_y, blink, breathe)

### Secondary (MEDIUM confidence)
- [VERIFIED: npm registry in package.json] @rive-app/canvas ^2.37.5
- [VERIFIED: npm registry in package.json] electron-log ^5.1.7

### Tertiary (LOW confidence)
- None — all claims verified against codebase

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — No new libraries; all existing and verified
- Architecture: HIGH — All flows verified against source code
- Pitfalls: HIGH — Based on code review of the exact files that will be modified

**Research date:** 2026-05-08
**Valid until:** 2026-06-08 (stable codebase, no fast-moving deps)
