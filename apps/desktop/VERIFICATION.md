# Phase 4: Model Management — Verification

## Overview

This phase implements model management for the Tauri 2 migration:
- `src-tauri/src/models/` module with scan, import, and removal
- Tauri commands for frontend integration
- File dialog import of `.riv` files
- Directory scanning with `.vivipet-registry.json`

## Requirements Covered

| Req ID | Description | Status |
|--------|-------------|--------|
| MOD-01 | File dialog import of .riv files | ✅ |
| MOD-02 | Directory scanning + models.json registry | ✅ |

## New Files

| File | Purpose |
|------|---------|
| `src-tauri/src/models/mod.rs` | Module root — types, top-level list/import/remove operations |
| `src-tauri/src/models/scan.rs` | `scan_models_dir()` — walkdir scanning of model directories |
| `src-tauri/src/models/import.rs` | `import_model_via_dialog()` — native dialog + file copy |
| `src-tauri/src/commands/models.rs` | Tauri commands: `model_list`, `model_import`, `model_refresh_scan`, `model_remove` |
| `VERIFICATION.md` | This verification document |

## Modified Files

| File | Change |
|------|--------|
| `src-tauri/Cargo.toml` | Added `tauri-plugin-dialog`, `tauri-plugin-fs`, `walkdir` |
| `src-tauri/src/error.rs` | Added `Model(String)` variant |
| `src-tauri/src/commands/mod.rs` | Added `pub mod models;` |
| `src-tauri/src/lib.rs` | Added `mod models;`, registered plugins + commands, startup models dir init |
| `src-tauri/src/tray/handlers.rs` | Wired `import_model` tray event to `models::import_model()` |
| `src-tauri/capabilities/default.json` | Added `dialog:default`, `dialog:allow-open`, `fs:default` |

## Tauri Commands

| Command | Signature | Description |
|---------|-----------|-------------|
| `model_list` | `() -> Vec<ModelConfig>` | List all imported models |
| `model_import` | `() -> Option<ModelConfig>` | Open file dialog, import .riv, return config |
| `model_refresh_scan` | `() -> Vec<ModelConfig>` | Re-scan and return updated list |
| `model_remove` | `(id: String) -> ()` | Remove model by ID |

## ModelConfig Structure (serialized as JSON to frontend)

```json
{
  "id": "my_model",
  "name": "My Model",
  "path": "/absolute/path/to/model.riv",
  "type": "rive",
  "window": { "width": 520, "height": 760 },
  "canvas": { "width": 520, "height": 760 }
}
```

## Verification Steps

### 1. Build verification

```bash
cd apps/desktop/src-tauri && cargo build
```

Expected: Clean build with no errors (warnings from pre-existing modules are acceptable).

### 2. Smoke test: model_list (empty)

Run the app, then from the frontend console:
```js
const { invoke } = await import('@tauri-apps/api/core');
const models = await invoke('model_list');
console.log(models);  // Expected: [] (empty array)
```

### 3. Smoke test: model_import

From frontend console:
```js
const { invoke } = await import('@tauri-apps/api/core');
const model = await invoke('model_import');
// Expected: Native file dialog opens, filter shows .riv files
// After selecting a file:
console.log(model);
// Expected: { id: "filename", name: "filename", path: "...", type: "rive", ... }
```

### 4. Smoke test: model_list (after import)

```js
const models = await invoke('model_list');
console.log(models);
// Expected: [{ id: "filename", name: "filename", ... }]
```

### 5. Smoke test: model_remove

```js
await invoke('model_remove', { id: 'filename' });
const models = await invoke('model_list');
console.log(models);
// Expected: [] (empty - model removed)
```

### 6. Tray menu: Import Model

- Right-click tray icon → Model → Import Model...
- Expected: Native file dialog opens filtered for .riv files
- After selection: model imported, `model:imported` event emitted

### 7. File structure verification

After import, verify the files exist:
```bash
# Replace <app_data> with actual path (typically ~/Library/Application Support/com.vivipet.app/)
ls -la "<app_data>/models/<modelId>/"
# Expected: model.riv and .vivipet-registry.json
```

### 8. Registry format

```bash
cat "<app_data>/models/<modelId>/.vivipet-registry.json"
# Expected:
# {
#   "id": "<modelId>",
#   "name": "<display name>",
#   "path": "<absolute path to model.riv>",
#   "type": "rive"
# }
```

## Architecture

```
Frontend (invoke)
    │
    ▼
commands/models.rs
    ├── model_list        → models::list_models()      → scan::scan_models_dir()
    ├── model_import      → models::import_model()     → import::import_model_via_dialog()
    ├── model_refresh_scan→ models::list_models()      → scan::scan_models_dir()
    └── model_remove      → models::remove_model()     → fs::remove_dir_all()

Storage:
    {app_data}/models/<id>/
        ├── model.riv                 ← copied .riv file
        └── .vivipet-registry.json    ← metadata (auto-generated during import)
```

## File Dialog Integration

Uses `tauri-plugin-dialog` with `blocking_pick_file()`:
- Filter: `Rive Model (.riv)` with `["riv"]` extension
- On selection: copies file, writes registry, returns config
- On cancel: returns `None`

## Migration Notes

The Electron implementation used:
- `vivipet-assets://` custom protocol for serving model files
- `dialog.showOpenDialog` from Electron

The Tauri 2 implementation uses:
- `tauri-plugin-dialog` for native file dialog
- `std::fs::copy` for file operations (no custom protocol needed)
- Absolute filesystem paths (frontend converts via `convertFileSrc()`)
- Same `.vivipet-registry.json` format for backward compatibility
