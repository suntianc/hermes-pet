/**
 * TTS Manager 核心
 *
 * 职责：
 *   1. 管理 TTS 队列（queue 策略）
 *   2. 根据配置选择 provider
 *   3. 流式转发音频块到渲染器
 *   4. 状态同步
 *
 * 流式架构：
 *   - local/cloud: HTTP 流式读取 → IPC 音频块 → renderer Web Audio API
 *   - system (macOS say): spawn 进程 → 系统直接播放 → IPC 状态同步
 */

import { BrowserWindow } from 'electron';
import log from 'electron-log';
import {
  TTSConfig,
  TTSSpeakOptions,
  loadConfig,
  saveConfig,
  getDefaultConfig,
  SystemTTSConfig,
  LocalTTSConfig,
  CloudTTSConfig,
} from './tts-config';
import { TTSPlayState } from './audio-chunk';
import { splitText, validateText, TextChunk } from './text-utils';
import { systemStream, abortSystemStream } from './streamers/system-streamer';
import { localStream, abortLocalStream } from './streamers/local-streamer';
import { cloudStream, abortCloudStream } from './streamers/cloud-streamer';

interface QueueItem {
  id: string;
  text: string;
  options?: TTSSpeakOptions;
  chunks: TextChunk[];
  currentChunk: number;
}

let instance: TTSManager | null = null;

export function getTTSManager(): TTSManager {
  if (!instance) {
    instance = new TTSManager();
  }
  return instance;
}

export class TTSManager {
  private config: TTSConfig;
  private queue: QueueItem[] = [];
  private isProcessing = false;
  private currentItems: Set<string> = new Set();
  private getWindow: (() => BrowserWindow | null) | null = null;

  constructor() {
    this.config = loadConfig();
  }

  /** 设置窗口获取回调（用于 IPC send） */
  setWindowGetter(getter: () => BrowserWindow | null): void {
    this.getWindow = getter;
  }

  /** 获取当前配置 */
  getConfig(): TTSConfig {
    return { ...this.config };
  }

  /** 更新配置并持久化 */
  setConfig(partial: Partial<TTSConfig>): TTSConfig {
    this.config = { ...this.config, ...partial };
    saveConfig(this.config);
    this.sendToRenderer('pet:tts:config', this.getConfig());
    return this.getConfig();
  }

  /** 重置为默认配置 */
  resetConfig(): TTSConfig {
    this.config = getDefaultConfig();
    saveConfig(this.config);
    this.sendToRenderer('pet:tts:config', this.getConfig());
    return this.getConfig();
  }

  // ---- 队列控制 ----

  /**
   * 请求播报文本
   * 入队等待，队列按 FIFO 串行处理
   */
  async speak(text: string, options?: TTSSpeakOptions): Promise<void> {
    log.info(`[TTS] speak() called: text="${text?.slice(0, 50)}" enabled=${this.config.enabled} source=${this.config.source}`);

    if (!text?.trim() || !this.config.enabled) {
      log.warn(`[TTS] speak() skipped: text="${text}" enabled=${this.config.enabled}`);
      return;
    }

    // 文本校验
    const errors = validateText(text, this.config.maxChars);
    if (errors.length > 0) {
      log.warn('[TTS] Text validation failed:', errors);
      return;
    }

    // 分段
    const textChunks = splitText(text, this.config.maxChars);
    if (textChunks.length === 0) return;

    const item: QueueItem = {
      id: generateId(),
      text,
      options,
      chunks: textChunks,
      currentChunk: 0,
    };

    this.queue.push(item);
    log.info(`[TTS] Queued: id=${item.id} chunks=${textChunks.length} text="${text.slice(0, 40)}..."`);

    if (!this.isProcessing) {
      this.processQueue();
    }
  }

  /** 停止所有播报并清空队列 */
  stop(): void {
    this.queue = [];
    abortSystemStream();
    abortLocalStream();
    abortCloudStream();
    this.currentItems.clear();
    this.isProcessing = false;
    this.sendToRenderer('pet:tts:state', { status: 'stopped' } satisfies TTSPlayState);
    log.info('[TTS] Stopped all playback');
  }

  // ---- 内部处理 ----

  private async processQueue(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;

    while (this.queue.length > 0) {
      const item = this.queue.shift()!;
      this.currentItems.add(item.id);

      try {
        await this.processItem(item);
      } catch (err) {
        log.error(`[TTS] Failed to process item ${item.id}:`, err);
        this.sendToRenderer('pet:tts:state', {
          status: 'error',
          message: err instanceof Error ? err.message : 'Unknown error',
        } satisfies TTSPlayState);
      } finally {
        this.currentItems.delete(item.id);
      }
    }

    this.isProcessing = false;
    this.sendToRenderer('pet:tts:state', { status: 'idle' } satisfies TTSPlayState);
  }

  private async processItem(item: QueueItem): Promise<void> {
    const source = this.config.source;
    if (source === 'none') {
      log.warn('[TTS] No TTS source configured, skipping');
      return;
    }

    // 逐段播报
    for (let i = 0; i < item.chunks.length; i++) {
      const chunk = item.chunks[i];

      // 发送状态：开始一段
      this.sendToRenderer('pet:tts:state', {
        status: 'playing',
        text: chunk.text,
        totalChunks: item.chunks.length,
        currentChunk: i,
      } satisfies TTSPlayState);

      try {
        switch (source) {
          case 'system':
            await this.handleSystemTTS(chunk.text, item.options);
            break;
          case 'local':
            await this.handleLocalTTS(chunk.text, item.options);
            break;
          case 'cloud':
            await this.handleCloudTTS(chunk.text, item.options);
            break;
        }
      } catch (err) {
        log.error(`[TTS] Source ${source} failed:`, err);
        throw err;
      }
    }
  }

  // ---- 各 Provider 处理 ----

  /**
   * 系统 TTS（macOS say）
   * spawn 进程直接播放，无需音频数据转发
   */
  private async handleSystemTTS(text: string, options?: TTSSpeakOptions): Promise<void> {
    const sayConfig: SystemTTSConfig = this.config.system || {};
    if (options?.model === 'preset' && options.voice) {
      sayConfig.voice = options.voice;
    }
    await systemStream(text, sayConfig, 'macos');
  }

  /**
   * 本地 TTS 服务
   * 流式读取音频 → IPC 逐块发送到渲染器
   */
  private async handleLocalTTS(text: string, options?: TTSSpeakOptions): Promise<void> {
    const localConfig: LocalTTSConfig = this.config.local || { url: 'http://127.0.0.1:5000/tts' };

    // 构建请求选项
    const speakOptions: TTSSpeakOptions = options || {
      text,
      voice: localConfig.url,
      model: 'preset',
    };

    let seq = 0;
    for await (const chunk of localStream(text, speakOptions, localConfig, this.config.chunkSize)) {
      this.sendToRenderer('pet:tts:audioChunk', chunk);
      seq++;

      // 简单延迟控制：避免渲染器缓冲区溢出
      // 实际依赖 IPC 的异步特性自然控制
      if (seq % 10 === 0) {
        await sleep(1); // 让事件循环有时间处理 IPC
      }
    }
  }

  /**
   * 云端 TTS API
   * 流式读取音频 → IPC 逐块发送到渲染器
   */
  private async handleCloudTTS(text: string, options?: TTSSpeakOptions): Promise<void> {
    const cloudConfig: CloudTTSConfig = this.config.cloud || { provider: 'openai', apiKey: '' };

    const speakOptions: TTSSpeakOptions = options || {
      text,
      voice: cloudConfig.voice || 'alloy',
      model: 'preset',
    };

    let seq = 0;
    for await (const chunk of cloudStream(text, speakOptions, cloudConfig, this.config.chunkSize)) {
      this.sendToRenderer('pet:tts:audioChunk', chunk);
      seq++;
      if (seq % 10 === 0) {
        await sleep(1);
      }
    }
  }

  // ---- IPC 工具 ----

  private sendToRenderer(channel: string, data: unknown): void {
    if (!this.getWindow) return;
    const win = this.getWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send(channel, data);
    }
  }
}

// ---- 工具函数 ----

let idCounter = 0;
function generateId(): string {
  return `tts_${Date.now()}_${++idCounter}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
