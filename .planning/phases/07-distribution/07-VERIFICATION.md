# Phase 7: Distribution — Verification Report

**Date:** 2026-05-11
**Plan:** 07-distribution (single execution wave)

---

## Overview

Distribution infrastructure for ViviPet on macOS (.dmg), Windows (.msi), and Linux (.AppImage) with auto-update support and code signing configuration.

## Files Created/Modified

| File | Action | Purpose |
|------|--------|---------|
| `apps/desktop/src-tauri/tauri.conf.json` | Modified | Bundle targets (dmg/msi/appimage), macOS signing & entitlements, updater config with `dialog: false` |
| `apps/desktop/src-tauri/entitlements.plist` | Created | macOS hardened runtime entitlements (transparency, networking, filesystem) |
| `.github/workflows/release.yml` | Modified | Converted build job to use `tauri-apps/tauri-action@v4`; added notarization env vars and updater pubkey validation |
| `apps/desktop/src-tauri/Cargo.lock` | Modified | Locked `tauri-plugin-updater` v2.10.1 and its dependencies |

## Pre-existing (No Changes Needed)

| File | Status | Reason |
|------|--------|--------|
| `apps/desktop/src-tauri/Cargo.toml` | ✅ Already had `tauri-plugin-updater = "2"` | Dependency was added in an earlier phase |
| `apps/desktop/src-tauri/src/lib.rs` | ✅ Already registers updater plugin | `.plugin(tauri_plugin_updater::Builder::new().build())` at line 40 |
| `apps/desktop/src-tauri/capabilities/default.json` | ✅ Already has updater permissions | `updater:default`, `updater:allow-check`, `updater:allow-download-and-install` |
| `apps/desktop/src/components/UpdateNotification.tsx` | ✅ Already exists | Full React component with progress bar, download/install/retry/dismiss UI |
| `apps/desktop/src/App.tsx` | ✅ Already imports `<UpdateNotification />` | Rendered at line 547 |
| `apps/desktop/src-tauri/icons/` | ✅ All icons present | `32x32.png`, `128x128.png`, `128x128@2x.png`, `icon.icns`, `icon.ico` |
| `apps/desktop/src-tauri/rust-toolchain.toml` | ✅ All targets configured | aarch64/x86_64 macOS, x86_64 Linux, x86_64 Windows |

## Build Verification

### Cargo Check

```bash
$ cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml
    Finished `dev` profile [unoptimized + debuginfo] target(s) in 2.39s
```

Result: **PASSED** — No errors. Only pre-existing dead_code warnings (26, all pre-dating this phase).

## Key Configuration Snapshots

### tauri.conf.json — Bundle
```json
"bundle": {
  "active": true,
  "targets": ["dmg", "msi", "appimage"],
  "macOS": {
    "minimumSystemVersion": "12.0",
    "signingIdentity": "-",
    "entitlements": "entitlements.plist"
  },
  "linux": {
    "deb": { "depends": ["libwebkit2gtk-4.1-dev"] },
    "appimage": { "bundleMediaFramework": true }
  },
  "windows": {
    "wix": null,
    "nsis": { "installMode": "currentUser" }
  }
}
```

### tauri.conf.json — Updater
```json
"plugins": {
  "updater": {
    "active": true,
    "dialog": false,
    "pubkey": "TODO_ADD_YOUR_PUBKEY_HERE",
    "endpoints": ["https://releases.vivipet.app/{{target}}/{{current_version}}"],
    "windows": { "installMode": "currentUser" }
  }
}
```

### Release Workflow
- **Verify job**: Checks tag matches `tauri.conf.json` version + validates updater pubkey is configured
- **Build job**: Uses `tauri-apps/tauri-action@v4` with `--target ${{ matrix.target }}`
- **Updater-meta job**: Generates `updater.json` with platform signatures and pubkey
- **Release job**: Creates draft GitHub Release with all artifacts attached

## Remaining Setup Required

1. **Generate updater signing keys:**
   ```bash
   cd apps/desktop
   npx tauri signer generate -w ~/.tauri/vivipet.key
   ```
   - Set `UPDATER_SIGN_PRIVKEY` as GitHub secret
   - Copy public key into `tauri.conf.json` → `plugins.updater.pubkey`

2. **Set GitHub secrets for CI:**
   - `APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_ISSUER_ID`
   - `WINDOWS_SIGN_CERT` (base64-encoded pfx), `WINDOWS_SIGN_PASSWORD`
   - `UPDATER_SIGN_PRIVKEY`, `UPDATER_SIGN_PUBKEY`

3. **Configure release endpoints:**
   - Set up `releases.vivipet.app` to serve `updater.json` or use GitHub Releases URL format
   - Current endpoint: `https://releases.vivipet.app/{{target}}/{{current_version}}`

4. **Create first release:**
   ```bash
   git tag v0.2.0 && git push origin v0.2.0
   ```

## Threat Surface

| Flag | File | Description |
|------|------|-------------|
| `threat_flag: new_network_client` | `apps/desktop/src-tauri/entitlements.plist` | macOS `network.client` entitlement for updater HTTP calls |
| `threat_flag: new_code_signing` | `.github/workflows/release.yml` | CI secrets passed as env vars for macOS/Windows code signing |
| `threat_flag: updater_endpoint` | `apps/desktop/src-tauri/tauri.conf.json` | External updater endpoint URL must be HTTPS; MITM could serve malicious update packages |
| `threat_flag: signature_verification` | `apps/desktop/src-tauri/tauri.conf.json` | Updater pubkey is currently placeholder (`TODO_ADD_YOUR_PUBKEY_HERE`) — no signature verification until real key is configured |

## UAT Coverage

| UAT-ID | Description | Status |
|--------|-------------|--------|
| DST-01 | tauri-plugin-updater integration + custom React update notification UI | ✅ Complete (plugin registered, UpdateNotification component active, dialog:false) |
| DST-02 | macOS .dmg build + signing + notarization config | ✅ Complete (dmg target, signingIdentity, entitlements.plist, notarization env vars) |
| DST-03 | Windows .msi build + signing config | ✅ Complete (msi + nsis targets, SIGN_COMMAND via env) |
| DST-04 | Linux .AppImage build | ✅ Complete (AppImage target with bundleMediaFramework) |

## Design Decisions

1. **`dialog: false`** — Use custom React update UI (`UpdateNotification.tsx`) instead of Tauri's native dialog for consistent appearance with the transparent window design.

2. **`signingIdentity: "-"`** — Ad-hoc signing for development. Production builds override via `APPLE_SIGNING_IDENTITY` env var on CI.

3. **`tauri-action@v4`** — Standardized build pipeline using `tauri-apps/tauri-action` for consistent cross-platform builds with built-in artifact handling.

4. **Endpoints URL** — Using `releases.vivipet.app/{{target}}/{{current_version}}` allows flexible hosting (GitHub Releases, S3, or custom server). The template variables `{{target}}` and `{{current_version}}` are expanded by Tauri at runtime.

5. **Entitlements file** — Created a minimal but sufficient `entitlements.plist` for macOS hardened runtime. The app uses transparency (needs `disable-library-validation`), networking (`network.client/server`), and file access for model imports.
