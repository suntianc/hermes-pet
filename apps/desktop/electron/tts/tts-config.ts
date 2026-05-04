/**
 * TTS 配置定义和持久化
 *
 * 存储在 userData/tts-config.json
 * API Key 使用 Electron safeStorage 加密存储
 */

import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

// ---- 三种 TTS 请求模式 ----

/** Preset 模式：使用预设语音 */
export interface PresetModeOptions {
  text: string;
  voice?: string;
  model: 'preset';
}

/** Clone 模式：语音克隆，不做额外参数 */
export interface CloneModeOptions {
  text: string;
  model: 'clone';
}

/** Instruct 模式：指令控制语音风格 */
export interface InstructModeOptions {
  text: string;
  instruct: string;
  model: 'instruct';
}

/** TTS 调用统一入参 */
export type TTSSpeakOptions = PresetModeOptions | CloneModeOptions | InstructModeOptions;

// ---- 持久化配置 ----

export type TTSProviderType = 'none' | 'system' | 'local' | 'cloud';

/** 系统 TTS 配置（macOS say / edge-tts） */
export interface SystemTTSConfig {
  voice?: string;
  rate?: number;      // 0.5 ~ 2.0
}

/** 本地 TTS 服务配置 */
export interface LocalTTSConfig {
  url: string;                // 默认 http://127.0.0.1:5000/tts
  format?: 'wav' | 'mp3' | 'pcm';
}

/** 云端 TTS 配置 */
export interface CloudTTSConfig {
  provider: 'openai' | 'elevenlabs' | 'azure' | 'custom';
  apiKey?: string;            // 建议用 safeStorage 加密后存储
  voice?: string;
  model?: string;
  endpoint?: string;          // 自定义端点
}

export type InterruptionStrategy = 'queue' | 'interrupt';

export interface TTSConfig {
  enabled: boolean;
  maxChars: number;                   // 单次播报最大字数，默认 500
  source: TTSProviderType;           // 当前使用的 TTS 源
  interruptionStrategy: InterruptionStrategy;  // 中断策略
  chunkSize: number;                  // 音频分块大小（字节），默认 16384
  fallbackToBubble: boolean;         // TTS 失败时是否回退气泡，默认 true

  system?: SystemTTSConfig;
  local?: LocalTTSConfig;
  cloud?: CloudTTSConfig;
}

const DEFAULT_CONFIG: TTSConfig = {
  enabled: false,
  maxChars: 500,
  source: 'none',
  interruptionStrategy: 'queue',
  chunkSize: 16384,
  fallbackToBubble: true,
};

function getConfigPath(): string {
  return path.join(app.getPath('userData'), 'tts-config.json');
}

/** 加载持久化配置 */
export function loadConfig(): TTSConfig {
  try {
    const configPath = getConfigPath();
    if (fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, 'utf-8');
      return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
    }
  } catch {
    // 读取失败时使用默认配置
  }
  return { ...DEFAULT_CONFIG };
}

/** 持久化保存配置 */
export function saveConfig(config: TTSConfig): void {
  const configPath = getConfigPath();
  try {
    const dir = path.dirname(configPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
  } catch (err) {
    console.error('[TTSConfig] Failed to save config:', err);
  }
}

/** 获取默认配置 */
export function getDefaultConfig(): TTSConfig {
  return { ...DEFAULT_CONFIG };
}
