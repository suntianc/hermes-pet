# Phase 2: 动画与交互 — Context

**Gathered:** 2026-05-12
**Status:** Ready for planning

<domain>
## Phase Boundary

在 Phase 1 Live2DRenderer 基础上实现 TTS 唇形同步、鼠标跟随、空闲动画循环。

**Requirements:** L2D-04 (唇形同步), L2D-05 (鼠标跟随), L2D-06 (空闲动画)

</domain>

<decisions>
## Implementation Decisions

### Agent Discretion
All technical choices at agent discretion.参考已有模式：
- TTS唇形同步: CubismDefaultParameterId.MouthOpenY + RMS振幅映射
- 鼠标跟随: CubismDefaultParameterId.ParamAngleX/ParamAngleY + lerp 平滑
- 空闲动画: CubismBreath + CubismEyeBlink (Cubism Framework 内置)
- 400ms idle return: 已在 Phase 1 Live2DRenderer 中实现的 MOMENTARY_DURATION 逻辑

</decisions>

<canonical_refs>
- `.planning/REQUIREMENTS.md` — L2D-04, L2D-05, L2D-06
- `.planning/ROADMAP.md` §Phase 2 — Success criteria
- `src/features/pet/Live2DRenderer.ts` — Phase 1 输出，需要增强
- `src/features/pet/RiveRenderer.ts` — 参考现有的 setSpeaking/lookAt 模式
- `src/audio/streaming-player.ts` — TTS 音频 RMS 振幅来源
</canonical_refs>

---

*Phase: 2-Animation-Interaction*
*Context gathered: 2026-05-12*
