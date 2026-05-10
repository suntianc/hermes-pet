/**
 * 音频数据类型定义
 *
 * 从 electron/tts/audio-chunk.ts 移入 — Phase 6 移除 Electron 后独立使用
 * 适配 Tauri Channel 的 TtsStreamEvent 格式
 */

/** 音频格式 */
export type AudioFormat = 'mp3' | 'wav' | 'pcm_f32le' | 'pcm_s16le';

/** 单次流式音频块（适配 Tauri Channel 输出） */
export interface AudioChunk {
  /** 音频二进制数据 */
  data: Uint8Array;
  /** 采样率 */
  sampleRate: number;
  /** 序列号，确保按序到达 */
  seq: number;
  /** 是否为最后一块 */
  isFinal: boolean;
}

/**
 * Tauri Channel 传输的 TTS 流事件（镜像 Rust TtsStreamEvent）
 * serde tag = "event" 将变体名序列化为顶层 "event" 字段
 */
export interface TtsStreamEvent {
  event: 'audio' | 'finished' | 'error';

  // AudioChunk 字段（扁平化，与 event 同级）
  data?: number[];             // Vec<u8> → number[]
  seq?: number;
  sample_rate?: number;
  isFinal?: boolean;

  // Finished 字段
  totalChunks?: number;
  durationMs?: number;

  // Error 字段
  message?: string;
  recoverable?: boolean;
}

/** TTS 播放状态（从 Rust TTSPlayState 镜像） */
export type TTSPlayState =
  | { status: 'idle' }
  | { status: 'playing'; request_id?: string; text: string; total_chunks: number; current_chunk: number }
  | { status: 'completed'; request_id?: string }
  | { status: 'stopped' }
  | { status: 'error'; request_id?: string; message: string };
