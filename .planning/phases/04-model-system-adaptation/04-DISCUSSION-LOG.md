# Phase 4: Model System Adaptation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-08
**Phase:** 4-Model System Adaptation
**Areas discussed:** vivipet-assets protocol, import flow, Rive action mapping, electron-builder.yml, default model, user docs

---

## vivipet-assets Protocol

**User's choice:** "你的建议及原因？"

**Recommendation:** Keep vivipet-assets:// (D-01). Already implemented, secure, directly applicable to .riv files via fetch + ArrayBuffer → `new Rive({ buffer })`.

| Option | Description | Selected |
|--------|-------------|----------|
| Keep protocol | Continue serving userData/models/ via vivipet-assets:// | ✓ (recommended) |
| Remove protocol | Replace with IPC or file:// | |

---

## Model Import Flow

**User's choice:** "文件对话框选 .riv"

| Option | Description | Selected |
|--------|-------------|----------|
| File dialog for .riv | Select .riv file, copy to userData/models/ | ✓ |
| Directory auto-discovery | Scan userData/models/ at startup | |

---

## Rive Action Mapping Convention

**User's choice:** "强约定：文档说明"

| Option | Description | Selected |
|--------|-------------|----------|
| Documentation | List SM input names in docs | ✓ |
| Code constraints | TypeScript type enforcement | |
| Status quo | rive-inputs.ts constants only | |

---

## Default Model

**User's choice:** "提供默认.riv，但是开发过程中先不留"

| Option | Description | Selected |
|--------|-------------|----------|
| Built-in default | Prepare infrastructure, user adds later | ✓ |
| No default | Fallback message at startup | |

---

## User Documentation

**User's choice:** "轻量：README 风格"

| Option | Description | Selected |
|--------|-------------|----------|
| Lightweight README | SM inputs, file placement, models.json config | ✓ |
| Full guide | Includes .riv creation tutorial | |

---

## the agent's Discretion

- models.json .riv entry schema (simplified vs full)
- modelId generation strategy
- Doc file location (docs/ or root)

## Deferred Ideas

- Default .riv model file — user provides later
- electron-builder.yml .riv model references — add when models available
- Rive Data Binding / ViewModel — out of scope
