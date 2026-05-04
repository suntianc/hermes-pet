/**
 * 云端 TTS 流式合成器
 *
 * 支持：
 *   - OpenAI TTS (tts-1 / tts-1-hd)
 *   - ElevenLabs TTS
 *   - Azure Speech
 *   - 自定义兼容 API
 *
 * openai 流式：POST https://api.openai.com/v1/audio/speech
 *   → 返回 streamed audio/mpeg
 *
 * elevenlabs 流式：POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}/stream
 *   → 返回 streaming audio/mpeg
 *
 * azure 流式：SSML → REST API → streaming audio
 */

import { CloudTTSConfig, TTSSpeakOptions } from '../tts-config';
import { AudioChunk } from '../audio-chunk';
import log from 'electron-log';

let abortController: AbortController | null = null;

/**
 * 云端 TTS 流式合成
 * 返回 AsyncGenerator 逐块产出音频数据
 */
export async function* cloudStream(
  text: string,
  options: TTSSpeakOptions,
  config: CloudTTSConfig,
  chunkSize: number,
): AsyncGenerator<AudioChunk> {
  abortController = new AbortController();

  if (!config.apiKey) {
    throw new Error('Cloud TTS: API key is not configured');
  }

  const provider = config.provider || 'openai';
  const voice = (options.model === 'preset' && options.voice)
    ? options.voice
    : config.voice || 'alloy';

  const { url, headers, format, sampleRate } = buildProviderRequest(
    provider, text, voice, options, config,
  );

  log.info(`[CloudTTS] ${provider} voice=${voice} model=${options.model}`);

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(buildRequestBody(provider, text, voice, options, config)),
    signal: abortController.signal,
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => 'unknown');
    throw new Error(`Cloud TTS ${provider} HTTP ${response.status}: ${errText}`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('Cloud TTS response body is not readable');
  }

  let seq = 0;
  let buffer = new Uint8Array(0);

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const newBuf = new Uint8Array(buffer.length + value.length);
      newBuf.set(buffer);
      newBuf.set(value, buffer.length);
      buffer = newBuf;

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

    if (buffer.length > 0) {
      yield {
        data: buffer,
        format,
        sampleRate,
        seq: seq++,
        isFinal: true,
      };
    } else {
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

/** 中止当前云端 TTS 请求 */
export function abortCloudStream(): void {
  abortController?.abort();
  abortController = null;
}

/** 构建请求 Headers 和 URL */
function buildProviderRequest(
  provider: string,
  _text: string,
  voice: string,
  _options: TTSSpeakOptions,
  config: CloudTTSConfig,
): { url: string; headers: Record<string, string>; format: AudioChunk['format']; sampleRate: number } {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  let url = '';
  let format: AudioChunk['format'] = 'mp3';
  let sampleRate = 24000;

  switch (provider) {
    case 'openai':
      url = 'https://api.openai.com/v1/audio/speech';
      headers['Authorization'] = `Bearer ${config.apiKey}`;
      break;

    case 'elevenlabs':
      url = `https://api.elevenlabs.io/v1/text-to-speech/${voice}/stream`;
      headers['xi-api-key'] = config.apiKey!;
      format = 'mp3';
      sampleRate = 44100;
      break;

    case 'azure':
      url = config.endpoint || 'https://your-region.tts.speech.microsoft.com/cognitiveservices/v1';
      headers['Ocp-Apim-Subscription-Key'] = config.apiKey!;
      headers['X-Microsoft-OutputFormat'] = 'audio-48khz-192kbitrate-mono-mp3';
      format = 'mp3';
      sampleRate = 48000;
      break;

    case 'custom':
      url = config.endpoint || 'http://127.0.0.1:5000/tts';
      format = 'mp3';
      break;
  }

  return { url, headers, format, sampleRate };
}

/** 构建请求体 */
function buildRequestBody(
  provider: string,
  text: string,
  voice: string,
  options: TTSSpeakOptions,
  config: CloudTTSConfig,
): Record<string, unknown> {
  const model = config.model || 'tts-1';
  const responseFormat = 'mp3';

  switch (provider) {
    case 'openai':
      return {
        model,
        input: text,
        voice,
        response_format: responseFormat,
      };

    case 'elevenlabs':
      return {
        text,
        model_id: model || 'eleven_turbo_v2',
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      };

    case 'azure':
      // Azure 使用 SSML
      return {
        ssml: `<speak version='1.0' xml:lang='zh-CN'>
          <voice xml:lang='zh-CN' xml:gender='Female' name='${voice}'>
            ${escapeXml(text)}
          </voice>
        </speak>`,
      };

    case 'custom':
      // 自定义端点使用统一入参格式
      return {
        text,
        voice,
        model: options.model,
        ...(options.model === 'instruct' ? { instruct: (options as any).instruct } : {}),
      };

    default:
      return { text, voice };
  }
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
