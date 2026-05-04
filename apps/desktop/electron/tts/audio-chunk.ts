/**
 * TTS 流式音频数据类型定义
 */

/** 音频格式 */
export type AudioFormat = 'mp3' | 'wav' | 'pcm_f32le' | 'pcm_s16le';

/** 单次流式音频块 */
export interface AudioChunk {
  /** 音频二进制数据 */
  data: Uint8Array;
  /** 音频编码格式 */
  format: AudioFormat;
  /** 采样率 */
  sampleRate: number;
  /** 序列号，确保按序到达 */
  seq: number;
  /** 是否为最后一块 */
  isFinal: boolean;
}

/** TTS 播放状态 */
export type TTSPlayState =
  | { status: 'idle' }
  | { status: 'playing'; text: string; totalChunks: number; currentChunk: number }
  | { status: 'stopped' }
  | { status: 'error'; message: string };

/** 唇形同步振幅数据 */
export interface LipSyncData {
  rms: number;    // 0.0 ~ 1.0 归一化 RMS
  timestamp: number;
}
