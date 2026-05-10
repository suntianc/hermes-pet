# Phase 3: HTTP Adapter — Verification

## Prerequisites

1. The app must be compiled: `cd apps/desktop/src-tauri && cargo check` (passes)
2. Unit tests pass: `cargo test adapter::events::tests` (9/9 pass)
3. The adapter module is compiled into the binary — no runtime flags needed

## Verification Steps

### Step 1: Build Verification

```bash
cd apps/desktop/src-tauri && cargo check
```

**Expected:** Clean compilation, zero errors.

### Step 2: Unit Tests

```bash
cd apps/desktop/src-tauri && cargo test adapter::events::tests -- --nocapture
```

**Expected:**
```
test test_capabilities_build ... ok
test test_normalize_empty_body ... ok
test test_tool_error_momentary ... ok
test test_task_done_happy ... ok
test test_thinking_to_pet_event ... ok
test test_tool_start_maps_to_searching ... ok
test test_unknown_phase_returns_none ... ok
test test_normalize_basic_event ... ok
test test_normalize_phase_aliases ... ok
test result: ok. 9 passed
```

### Step 3: Functional Verification (requires app runtime)

Run the app:
```bash
cd apps/desktop && cargo tauri dev
```

Once the app window appears, test the adapter endpoints in a separate terminal:

#### 3a. GET /adapter/capabilities

```bash
curl http://localhost:18765/adapter/capabilities
```

**Expected response (HTTP 200):**
```json
{
  "ok": true,
  "version": "adapter.v1",
  "service": "vivipet-adapter",
  "capabilities": {
    "states": ["idle","thinking","speaking","searching","reading","coding","terminal","testing","waiting_user","success","error","happy"],
    "phases": ["idle","thinking","speaking","tool:start","tool:success","tool:error","task:done","session:start","session:update","session:end","message"],
    "speech": true,
    "tts": true,
    "ttsControl": {
      "field": "tts",
      "default": false,
      "fallbackToBubble": true,
      "acceptedValues": ["boolean","options.enabled"]
    }
  }
}
```

#### 3b. POST /adapter (thinking event)

```bash
curl -X POST http://localhost:18765/adapter \
  -H "Content-Type: application/json" \
  -d '{"agent":"test","phase":"thinking","text":"Analyzing code structure..."}'
```

**Expected response (HTTP 200):**
```json
{
  "ok": true,
  "version": "adapter.v1",
  "event": {
    "version": "adapter.v1",
    "action": "thinking",
    "mode": "continuous",
    "text": "Analyzing code structure...",
    "source": {
      "agent": "test",
      "phase": "thinking",
      "sessionId": null
    }
  }
}
```

#### 3c. POST /adapter (tool:start with kind)

```bash
curl -X POST http://localhost:18765/adapter \
  -H "Content-Type: application/json" \
  -d '{"agent":"hermes","phase":"tool:start","kind":"code","text":"Refactoring module..."}'
```

**Expected response (HTTP 200):** Action maps to "coding" via `tool_to_action()`.

#### 3d. POST /adapter (unknown phase)

```bash
curl -X POST http://localhost:18765/adapter \
  -H "Content-Type: application/json" \
  -d '{"agent":"test","phase":"nonexistent"}'
```

**Expected response (HTTP 400):**
```json
{
  "ok": false,
  "error": "Unknown adapter phase: Unknown"
}
```

#### 3e. OPTIONS (CORS preflight)

```bash
curl -X OPTIONS http://localhost:18765/adapter -v 2>&1 | grep -i 'access-control'
```

**Expected:** `Access-Control-Allow-Origin: *` and other CORS headers in response.

### Step 4: Graceful Shutdown Verification

1. Start the app (`cargo tauri dev`)
2. Confirm adapter is running (curl both endpoints)
3. Quit the app (Cmd+Q or tray Quit)
4. Check the logs for: `[Adapter] Server shut down gracefully` and `[Adapter] Axum server shutdown complete`
5. Verify the process exits cleanly (no hanging, no crash)

### Step 5: Port Configuration

Test with custom port:
```bash
VIVIPET_ADAPTER_PORT=18999 cargo tauri dev
curl http://localhost:18999/adapter/capabilities
```

## Verification Summary

| Check | Status |
|-------|--------|
| `cargo check` passes | ✅ |
| 9 unit tests pass | ✅ |
| GET /adapter/capabilities (HTTP 200) | ⬜ (runtime) |
| POST /adapter thinking event (HTTP 200) | ⬜ (runtime) |
| POST /adapter unknown phase (HTTP 400) | ⬜ (runtime) |
| CORS headers present | ⬜ (runtime) |
| Graceful shutdown on Exit | ⬜ (runtime) |
| Event emitted to WebView | ⬜ (Phase 6) |
| Custom port via env var | ⬜ (runtime) |
