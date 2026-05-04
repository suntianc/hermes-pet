/**
 * 系统 TTS 流式合成器
 *
 * macOS: 使用 `say` 命令（零依赖，天然流式播放）
 * 	usage: say -v VoiceName "text"
 * edge-tts (CLI 插件): 需要安装 Python + edge-tts
 * 	usage: edge-tts --text "text" --voice zh-CN-XiaoxiaoNeural --write-media -
 */

import { ChildProcess, spawn } from 'child_process';
import log from 'electron-log';
import { TTSPlayState } from '../audio-chunk';
import { SystemTTSConfig } from '../tts-config';

export interface SystemStreamResult {
  state: TTSPlayState;
}

/** 当前进程 */
let currentProcess: ChildProcess | null = null;

/**
 * macOS `say` 命令流式播报
 * @returns 播报结束后的 state
 */
function speakWithSay(
  text: string,
  config: SystemTTSConfig,
): Promise<SystemStreamResult> {
  return new Promise((resolve, reject) => {
    const args: string[] = [];
    if (config.voice) {
      args.push('-v', config.voice);
    }
    if (config.rate !== undefined) {
      // macOS say rate: 每分钟单词数，默认 ~200
      const rate = Math.round(200 * config.rate);
      args.push('-r', String(rate));
    }
    args.push(text);

    log.info(`[SystemTTS] say ${args.join(' ')}`);

    const proc = spawn('say', args, { stdio: 'ignore' });
    currentProcess = proc;

    proc.on('error', (err) => {
      log.error('[SystemTTS] say error:', err);
      currentProcess = null;
      reject(err);
    });

    proc.on('exit', (code) => {
      currentProcess = null;
      if (code === 0) {
        resolve({ state: { status: 'idle' } });
      } else {
        reject(new Error(`say exited with code ${code}`));
      }
    });
  });
}

/**
 * 通过 edge-tts CLI 流式播报
 * 将 stdout 输出的音频数据发送到主进程待处理
 */
function speakWithEdgeTTS(
  text: string,
  voice: string | undefined,
): Promise<SystemStreamResult> {
  return new Promise((resolve, reject) => {
    const voiceName = voice || 'zh-CN-XiaoxiaoNeural';

    const args = [
      '--text', text,
      '--voice', voiceName,
      '--write-media', '-',   // stdout 输出
    ];

    log.info(`[SystemTTS] edge-tts --voice ${voiceName}`);

    const proc = spawn('edge-tts', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    currentProcess = proc;

    const audioChunks: Buffer[] = [];

    proc.stdout?.on('data', (chunk: Buffer) => {
      audioChunks.push(chunk);
    });

    proc.on('error', (err) => {
      log.error('[SystemTTS] edge-tts error:', err);
      currentProcess = null;
      reject(err);
    });

    proc.on('exit', (code) => {
      currentProcess = null;
      if (code === 0) {
        if (audioChunks.length > 0) {
          // edge-tts 已输出完整音频到 stdout，但主进程无音频播放能力
          // 实际情况需要将音频数据转发到渲染器播放
          // 此路径在 TTSManager 中处理
          resolve({ state: { status: 'idle' } });
        }
      } else {
        reject(new Error(`edge-tts exited with code ${code}`));
      }
    });
  });
}

/**
 * 系统 TTS 流式播报
 */
export async function systemStream(
  text: string,
  config: SystemTTSConfig,
  engine: 'macos' | 'edge-tts' = 'macos',
): Promise<SystemStreamResult> {
  switch (engine) {
    case 'macos':
      return speakWithSay(text, config);
    case 'edge-tts':
      return speakWithEdgeTTS(text, config.voice);
  }
}

/** 中止当前系统 TTS 播报 */
export function abortSystemStream(): void {
  if (currentProcess && !currentProcess.killed) {
    currentProcess.kill('SIGTERM');
    currentProcess = null;
    log.info('[SystemTTS] aborted');
  }
}
