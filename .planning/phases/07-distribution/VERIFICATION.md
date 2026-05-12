# Phase 7 Distribution — Verification Guide

## Overview

Phase 7 configures ViviPet for distribution across macOS / Windows / Linux with automatic update support via `tauri-plugin-updater`. The verification steps below confirm each requirement.

---

## DST-01: tauri-plugin-updater Integration

### Automated Verification

```bash
# 1. Check updater plugin is registered in Cargo.toml
grep "tauri-plugin-updater" apps/desktop/src-tauri/Cargo.toml
# Expected: tauri-plugin-updater = "2"

# 2. Check updater plugin is registered in lib.rs
grep "tauri_plugin_updater" apps/desktop/src-tauri/src/lib.rs
# Expected: .plugin(tauri_plugin_updater::Builder::new().build())

# 3. Check updater npm package is installed
grep "@tauri-apps/plugin-updater" apps/desktop/package.json
# Expected: "@tauri-apps/plugin-updater": "^2..."

# 4. Check updater config in tauri.conf.json
grep -A5 '"updater"' apps/desktop/src-tauri/tauri.conf.json
# Expected: pubkey, endpoints, windows.installMode

# 5. Check updater permissions in capabilities
grep "updater" apps/desktop/src-tauri/capabilities/default.json
# Expected: updater:default, updater:allow-check, updater:allow-download-and-install
```

### Manual Verification

1. Build the app: `cd apps/desktop && npm run build`
2. Launch the app and observe the UpdateNotification component appears on startup (after ~10s delay)
3. Since there is no actual update server configured with a valid pubkey, the check will fail silently (status: `unavailable`)
4. To test the full flow:
   - Generate a keypair: `npx @tauri-apps/cli signer generate`
   - Add the public key to `tauri.conf.json` under `plugins.updater.pubkey`
   - Create a release on GitHub with the matching tag
   - Build with `TAURI_SIGNING_PRIVATE_KEY` env var set

---

## DST-02: macOS .dmg Build + Signing

### Automated Verification

```bash
# Check macOS bundle config
grep -A3 '"macOS"' apps/desktop/src-tauri/tauri.conf.json
# Expected: minimumSystemVersion, signing.identity
```

### Manual Build

```bash
# Build for macOS (unsigned dev build)
cd apps/desktop && npm run build

# Check .dmg was created
ls src-tauri/target/release/bundle/dmg/*.dmg 2>/dev/null || \
ls src-tauri/target/release/bundle/macOS/*.dmg 2>/dev/null || \
echo "Check for .dmg in bundle directory"
```

### CI Build (signed + notarized)

The release workflow signs with `$APPLE_SIGNING_IDENTITY` and notarizes via the `APPLE_ID`/`APPLE_PASSWORD`/`APPLE_TEAM_ID` secrets.

To test signing locally:
```bash
# Requires Apple Developer ID certificate in your keychain
export APPLE_SIGNING_IDENTITY="Developer ID Application: Your Name (TEAMID)"
export APPLE_ID="your@apple.id"
export APPLE_PASSWORD="app-specific-password"
export APPLE_TEAM_ID="TEAMID"
cd apps/desktop && npm run build
```

---

## DST-03: Windows .msi Build

### Automated Verification

```bash
# Check Windows config
grep -A3 '"windows"' apps/desktop/src-tauri/tauri.conf.json
# Expected: NSIS with installMode and signCommand
```

### CI Build (with signing)

The release workflow signs the installer using `SIGN_COMMAND` (signtool). The signing certificate must be set as `WINDOWS_SIGN_CERT` (base64) and `WINDOWS_SIGN_PASSWORD` secrets.

### Local Build (unsigned)

```bash
# Only possible on a Windows machine or cross-compilation setup
cd apps/desktop && npm run build
# Output: src-tauri/target/release/bundle/nsis/*.exe
```

---

## DST-04: Linux .AppImage Build

### Automated Verification

```bash
# Check Linux AppImage config
grep -A3 '"linux"' apps/desktop/src-tauri/tauri.conf.json
# Expected: deb.depends, appimage.bundleMediaFramework
```

### CI Build

The Linux build runs automatically on `ubuntu-latest` in the release workflow.

### Local Build

```bash
# Requires Linux with WebKit2GTK dependencies
# sudo apt install libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev libsoup-3.0-dev
cd apps/desktop && npm run build
# Output: src-tauri/target/release/bundle/appimage/*.AppImage
```

---

## Update Artifacts (.sig, .tar.gz)

### Automated Verification

```bash
# Check the release workflow generates updater artifacts
grep -A2 "updater" .github/workflows/release.yml
# Look for *.sig and *.tar.gz in the build job
```

### Manual Check

```bash
# After a Tauri build with TAURI_SIGNING_PRIVATE_KEY set:
ls apps/desktop/src-tauri/target/release/*.sig 2>/dev/null
ls apps/desktop/src-tauri/target/release/*.tar.gz 2>/dev/null
# Expected: ViviPet_<version>_<arch>.sig and ViviPet_<version>_<arch>.tar.gz
```

---

## Full E2E Test (CI)

1. Push a version tag: `git tag v0.2.0 && git push origin v0.2.0`
2. Monitor the release workflow in GitHub Actions
3. Verify all 4 platform jobs succeed (macOS arm64, macOS x64, Linux, Windows)
4. Verify updater.json is generated and attached to the draft release
5. Download one platform's .dmg/.AppImage/.exe and confirm it launches

---

## Key Secrets for CI

| Secret | Purpose |
|--------|---------|
| `APPLE_SIGNING_IDENTITY` | Codesign identity for macOS (e.g. "Developer ID Application: Name (TEAMID)") |
| `APPLE_ID` | Apple ID email for notarization |
| `APPLE_PASSWORD` | App-specific password for notarization |
| `APPLE_TEAM_ID` | Apple Team ID (10-character) |
| `WINDOWS_SIGN_CERT` | Base64-encoded .pfx certificate for Windows signing |
| `WINDOWS_SIGN_PASSWORD` | Password for the .pfx certificate |
| `UPDATER_SIGN_PUBKEY` | Public key for updater signature verification |
| `UPDATER_SIGN_PRIVKEY` | Private key to sign updater artifacts |
