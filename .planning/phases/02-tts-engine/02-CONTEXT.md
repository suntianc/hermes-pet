# Phase 2: TTS Engine — Context

**Gathered:** 2026-05-09
**Status:** Ready for planning
**Mode:** Agent discretion (discuss skipped per user preference)

<domain>
## Phase Boundary

Rust TTS 引擎，三 provider（system/local/cloud），队列管理，音频通过 Tauri Channel 流式传输到 WebView 的 Web Audio API。

**Requirements:** TTS-01 (system), TTS-02 (local), TTS-03 (cloud), TTS-04 (queue), TTS-05 (audio stream)

</domain>

<decisions>
## Implementation Decisions

### the agent's Discretion
All implementation choices at agent's discretion. Follow research recommendations:
- Audio: PCM 16-bit 44100Hz mono via Tauri Channel
- System TTS: std::process::Command per platform (macOS `say`, Windows PowerShell SAPI, Linux `espeak-ng`)
- Cloud TTS: reqwest streaming to OpenAI/ElevenLabs/Azure
- Queue: FIFO with text splitting at 500 chars
- Config: tauri-plugin-store
- Error fallback: system → local → cloud → bubble (frontend)

### Key References
- Existing `electron/tts/` module for API contract reference
- `apps/desktop/src/audio/streaming-player.ts` for Web Audio API integration
- `.planning/research/milestone2/STACK.md` for crate versions

</decisions>

<canonical_refs>
## Canonical References

- `.planning/PROJECT.md` — Project context
- `.planning/REQUIREMENTS.md` — TTS-01~05
- `.planning/ROADMAP.md` §Phase 2 — Goal, success criteria
- `.planning/research/milestone2/STACK.md` — Crate recommendations
- `.planning/research/milestone2/ARCHITECTURE.md` — Module-per-domain, Channel audio
- `.planning/research/milestone2/PITFALLS.md` — P-03 (cross-platform TTS), P-05 (audio format)
- `apps/desktop/electron/tts/` — Existing TTS implementation (reference)
- `apps/desktop/src/audio/streaming-player.ts` — Frontend audio player

</canonical_refs>

---

*Phase: 2-TTS Engine*
*Context gathered: 2026-05-09*
