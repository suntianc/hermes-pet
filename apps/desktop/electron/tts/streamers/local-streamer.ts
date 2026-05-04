/**
 * 本地 TTS 服务流式合成器
 *
 * 对接本地部署的 TTS 模型服务（如 Coqui TTS, VITS, GPT-SoVITS 等）
 * 三种模式统一接口：
 *   - preset: 使用预设音色
 *   - clone: 语音克隆
 *   - instruct: 指令控制语音风格
 *
 * local endpoint 接收请求体格式：
 *   {"text":"...", "voice":"Serena", "model":"preset"}
 *   {"text":"...", "model":"clone"}
 *   {"text":"...", "instruct":"娇嫩萝莉声", "model":"instruct"}
 *
 * 响应：Transfer-Encoding: chunked 或 Content-Type: audio/mpeg 的流式音频
 */

import { LocalTTSConfig, TTSSpeakOptions } from '../tts-config';
import { AudioChunk } from '../audio-chunk';
import log from 'electron-log';

let abortController: AbortController | null = null;

/**
 * 本地 TTS 流式合成
 * 返回 AsyncGenerator 逐块产出音频数据
 */
export async function* localStream(
  text: string,
  options: TTSSpeakOptions,
  config: LocalTTSConfig,
  chunkSize: number,
): AsyncGenerator<AudioChunk> {
  abortController = new AbortController();

  const url = config.url || 'http://127.0.0.1:5000/tts';

  // 本地服务通常使用大写首字母字段名（如 Text, Voice, Model, Instruct）
  const body = buildRequestBody(text, options);

  log.info(`[LocalTTS] POST ${url} model=${options.model} voice=${(options as any).voice || '-'}`);

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: abortController.signal,
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => 'unknown');
    throw new Error(`Local TTS HTTP ${response.status}: ${errText}`);
  }

  // 获取响应格式
  const contentType = response.headers.get('content-type') || '';
  const format = contentType.includes('wav') ? 'wav' :
                 contentType.includes('pcm') ? 'pcm_f32le' :
                 contentType.includes('mp3') ? 'mp3' : 'mp3';

  const sampleRate = 24000; // 默认 24kHz，实际可从响应头获取

  // 流式读取
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('Local TTS response body is not readable');
  }

  let seq = 0;
  let buffer = new Uint8Array(0);

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      // 追加到缓冲
      const newBuf = new Uint8Array(buffer.length + value.length);
      newBuf.set(buffer);
      newBuf.set(value, buffer.length);
      buffer = newBuf;

      // 达到 chunkSize 才产出
      while (buffer.length >= chunkSize) {
        const chunk = buffer.slice(0, chunkSize);
        buffer = buffer.slice(chunkSize);

        yield {
          data: chunk,
          format,
          sampleRate,
          seq: seq++,
          isFinal: false,
        };
      }
    }

    // 最后剩余数据
    if (buffer.length > 0) {
      yield {
        data: buffer,
        format,
        sampleRate,
        seq: seq++,
        isFinal: true,
      };
    } else {
      // 发送空的 final 块标记结束
      yield {
        data: new Uint8Array(0),
        format,
        sampleRate,
        seq: seq++,
        isFinal: true,
      };
    }
  } finally {
    reader.releaseLock();
    abortController = null;
  }
}

/** 中止当前本地 TTS 请求 */
export function abortLocalStream(): void {
  abortController?.abort();
  abortController = null;
}

/**
 * 构建统一请求体
 *
 * 本地 TTS 服务通常使用大写首字母字段名：
 *   Preset:   { "Text": "...", "Voice": "...", "Model": "preset" }
 *   Clone:    { "Text": "...", "Model": "clone" }
 *   Instruct: { "Text": "...", "Instruct": "...", "Model": "instruct" }
 */
function buildRequestBody(text: string, options: TTSSpeakOptions): Record<string, unknown> {
  switch (options.model) {
    case 'preset':
      return {
        Text: text,
        Model: 'preset',
        ...(options.voice ? { Voice: options.voice } : {}),
      };
    case 'clone':
      return {
        Text: text,
        Model: 'clone',
      };
    case 'instruct':
      return {
        Text: text,
        Instruct: options.instruct,
        Model: 'instruct',
      };
  }
}
