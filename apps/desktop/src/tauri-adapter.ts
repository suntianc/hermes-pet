/**
 * Tauri IPC 适配层
 *
 * 替换旧的 window.electronAPI，将所有 IPC 调用切换到 @tauri-apps/api。
 * - invoke() → Tauri commands (请求-响应)
 * - listen() → Tauri 事件 (推送)
 * - Channel  → TTS 音频流
 *
 * 使用方式：
 *   import { petWindow, petTTS, petModel, petAI, onPetAction, onPetEvent } from '../tauri-adapter';
 */

import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { Channel } from '@tauri-apps/api/core';
import type {
  Position2D,
  ModelConfigDTO,
  AiConfigDTO,
  AiPlanRequest,
  AiPlanResponse,
  AiTestResult,
  TTSConfigDTO,
  PetActionEvent,
  TTSProviderType,
} from './tauri-types';
import type { TtsStreamEvent } from './types/audio-chunk';

// ── 鼠标位置追踪 ──────────────────────────────────────────────────────
// Tauri 没有 getCursorScreenPoint 替代，使用全局 mouse 追踪

let lastMouseX = 0;
let lastMouseY = 0;
let mouseTrackingInitialized = false;

function initMouseTracking(): void {
  if (mouseTrackingInitialized) return;
  mouseTrackingInitialized = true;
  const handler = (e: MouseEvent) => {
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
  };
  document.addEventListener('mousemove', handler);
  // Cleanup on page unload (passive)
  window.addEventListener('beforeunload', () => document.removeEventListener('mousemove', handler));
}

/** 获取最后的鼠标 client 位置 */
export function getLastMousePosition(): { x: number; y: number } {
  initMouseTracking();
  return { x: lastMouseX, y: lastMouseY };
}

// ── 窗口控制 ──────────────────────────────────────────────────────────

export const petWindow = {
  /** 设置鼠标穿透模式 */
  setIgnoreMouseEvents: (ignore: boolean): Promise<void> => {
    return invoke('set_ignore_mouse_events', { ignore });
  },

  /** 获取窗口位置 */
  getPosition: (): Promise<Position2D> => {
    return invoke<Position2D>('get_window_position');
  },

  /** 获取鼠标在 client 坐标中的位置（从 DOM 追踪） */
  getCursorClientPoint: (): { x: number; y: number } => {
    return getLastMousePosition();
  },

  /** 开始拖拽窗口 */
  beginDrag: (): Promise<void> => {
    return invoke('begin_drag');
  },

  /** 设置窗口尺寸 */
  setSize: (width: number, height: number): Promise<void> => {
    return invoke('set_window_size', { width, height });
  },

  /** 锚定右下角的尺寸设置 */
  setSizeAnchored: (width: number, height: number): Promise<void> => {
    return invoke('set_size_anchored', { width, height });
  },

  /** 更新托盘模型名列表（无返回） */
  updateModelNames: (names: string[]): Promise<void> => {
    return invoke('update_model_names', { names });
  },
};

// ── 模型管理 ──────────────────────────────────────────────────────────

export const petModel = {
  /** 导入模型（文件对话框） */
  importModel: (): Promise<ModelConfigDTO | null> => {
    return invoke<ModelConfigDTO | null>('model_import');
  },

  /** 列出所有已导入模型 */
  listModels: (): Promise<ModelConfigDTO[]> => {
    return invoke<ModelConfigDTO[]>('model_list');
  },

  /** 刷新扫描模型目录 */
  refreshScan: (): Promise<ModelConfigDTO[]> => {
    return invoke<ModelConfigDTO[]>('model_refresh_scan');
  },

  /** 删除模型 */
  removeModel: (id: string): Promise<void> => {
    return invoke('model_remove', { id });
  },
};

// ── TTS ────────────────────────────────────────────────────────────────

export const petTTS = {
  /** 语音合成：创建 Channel，返回 Channel 以便前端监听 */
  speak: (text: string, voice?: string): { channel: Channel<TtsStreamEvent>; promise: Promise<void> } => {
    const channel = new Channel<TtsStreamEvent>();
    const promise = invoke<void>('tts_speak', { text, voice: voice ?? null, onEvent: channel });
    return { channel, promise };
  },

  /** 停止 TTS 播放 */
  stop: (): Promise<void> => {
    return invoke('tts_stop');
  },

  /** 获取 TTS 配置 */
  getConfig: (): Promise<TTSConfigDTO> => {
    return invoke<TTSConfigDTO>('tts_get_config');
  },

  /** 设置 TTS 配置 */
  setConfig: (config: Partial<TTSConfigDTO>): Promise<void> => {
    return invoke('tts_set_config', { config });
  },

  /** 获取可用语音列表 */
  getVoices: (provider?: string): Promise<string[]> => {
    return invoke<string[]>('tts_get_voices', { provider: provider ?? 'system' });
  },
};

// ── AI 行为规划 ────────────────────────────────────────────────────────

export const petAI = {
  /** 获取 AI 配置 */
  getConfig: (): Promise<AiConfigDTO> => {
    return invoke<AiConfigDTO>('ai_get_config');
  },

  /** 设置 AI 配置 */
  setConfig: (config: AiConfigDTO): Promise<void> => {
    return invoke('ai_set_config', { config });
  },

  /** 测试连接 */
  testConnection: (configOverride?: AiConfigDTO): Promise<string> => {
    return invoke<string>('ai_test_connection', {
      configOverride: configOverride ?? null,
    });
  },

  /** 规划行为 */
  plan: (request: AiPlanRequest): Promise<AiPlanResponse> => {
    return invoke<AiPlanResponse>('ai_plan', { request });
  },
};

// ── Tauri 事件监听 ───────────────────────────────────────────────────

/**
 * 监听 pet:action 事件（由托盘菜单触发）
 * 返回取消监听函数
 */
export function onPetAction(callback: (action: string, params?: Record<string, unknown>) => void): Promise<UnlistenFn> {
  return listen<PetActionEvent>('pet:action', (event) => {
    const { action, ...params } = event.payload;
    callback(action, Object.keys(params).length > 0 ? params : undefined);
  });
}

/**
 * 监听 pet:event 事件（由 HTTP Adapter 触发）
 * 返回取消监听函数
 */
export function onPetEvent(callback: (eventPayload: unknown) => void): Promise<UnlistenFn> {
  return listen<unknown>('pet:event', (event) => {
    callback(event.payload);
  });
}

/**
 * 监听 TTS 状态事件（由 Rust TTS engine emit）
 * 返回取消监听函数
 */
export function onTTSState(callback: (state: unknown) => void): Promise<UnlistenFn> {
  return listen<unknown>('tts:state', (event) => {
    callback(event.payload);
  });
}

/**
 * 监听 TTS 配置变更事件
 * 返回取消监听函数
 */
export function onTTSConfig(callback: (config: unknown) => void): Promise<UnlistenFn> {
  return listen<unknown>('tts:config', (event) => {
    callback(event.payload);
  });
}

/**
 * 监听模型导入事件
 * 返回取消监听函数
 */
export function onModelImported(callback: (payload: { id: string; name: string }) => void): Promise<UnlistenFn> {
  return listen<{ id: string; name: string }>('model:imported', (event) => {
    callback(event.payload);
  });
}

// ── 工具函数 ──────────────────────────────────────────────────────────

/**
 * 将 snake_case 对象的键递归转换为 camelCase
 * 用于将 Rust 后端返回的 snake_case JSON 转换为前端预期的 camelCase
 */
export function snakeToCamel<T>(obj: unknown): T {
  if (obj === null || obj === undefined) return obj as T;
  if (Array.isArray(obj)) return obj.map(snakeToCamel) as unknown as T;
  if (typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      const camelKey = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
      result[camelKey] = snakeToCamel(value);
    }
    return result as T;
  }
  return obj as T;
}
