/**
 * TTS 模块统一导出
 */

export { TTSManager, getTTSManager } from './tts-manager';
export {
  TTSConfig,
  TTSSpeakOptions,
  PresetModeOptions,
  CloneModeOptions,
  InstructModeOptions,
  TTSProviderType,
  SystemTTSConfig,
  LocalTTSConfig,
  CloudTTSConfig,
  InterruptionStrategy,
  loadConfig,
  saveConfig,
  getDefaultConfig,
} from './tts-config';
export { AudioChunk, TTSPlayState, LipSyncData } from './audio-chunk';
export { splitText, validateText } from './text-utils';
