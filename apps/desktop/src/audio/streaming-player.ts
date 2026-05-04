/**
 * 流式音频播放器
 *
 * 接收主进程通过 IPC 传来的音频块，使用 Web Audio API 播放
 * 支持流式累积 → 解码 → 播放
 *
 * 注意: AudioContext 需要在用户交互后创建（浏览器安全策略）
 * 这里使用懒初始化，在首次播放时自动创建
 */

import { AudioChunk } from '../../electron/tts/audio-chunk';

export type PlayerState = 'idle' | 'accumulating' | 'playing' | 'ended' | 'error';

export interface PlayerStatus {
  state: PlayerState;
  accumulatedBytes: number;
  audioDuration?: number;  // 音频时长（秒）
}

type AmplitudeCallback = (rms: number) => void;
type StateCallback = (status: PlayerStatus) => void;

export class StreamingAudioPlayer {
  private audioContext: AudioContext | null = null;
  private buffer: Uint8Array[] = [];
  private totalLength = 0;
  private state: PlayerState = 'idle';
  private source: AudioBufferSourceNode | null = null;
  private gainNode: GainNode | null = null;
  private analyserNode: AnalyserNode | null = null;
  private animationFrameId: number | null = null;

  private amplitudeListeners: Set<AmplitudeCallback> = new Set();
  private stateListeners: Set<StateCallback> = new Set();
  private endListeners: Set<() => void> = new Set();

  // ---- 状态订阅 ----

  onAmplitude(cb: AmplitudeCallback): () => void {
    this.amplitudeListeners.add(cb);
    return () => this.amplitudeListeners.delete(cb);
  }

  onStateChange(cb: StateCallback): () => void {
    this.stateListeners.add(cb);
    return () => this.stateListeners.delete(cb);
  }

  onEnded(cb: () => void): () => void {
    this.endListeners.add(cb);
    return () => this.endListeners.delete(cb);
  }

  getState(): PlayerState {
    return this.state;
  }

  // ---- 核心 API ----

  /** 推送一个音频块 */
  async pushChunk(chunk: AudioChunk): Promise<void> {
    this.buffer.push(chunk.data);
    this.totalLength += chunk.data.length;

    if (this.state === 'idle') {
      this.state = 'accumulating';
      this.notifyState();
    }

    if (chunk.isFinal) {
      await this.play();
    }
  }

  /** 立即停止播放 */
  stop(): void {
    this.cancelAnimation();
    if (this.source) {
      try { this.source.stop(); } catch { /* 可能已停止 */ }
      this.source.disconnect();
      this.source = null;
    }
    this.buffer = [];
    this.totalLength = 0;
    this.state = 'idle';
    this.notifyState();
  }

  /** 设置音量 0.0 ~ 1.0 */
  setVolume(vol: number): void {
    if (this.gainNode) {
      this.gainNode.gain.value = Math.max(0, Math.min(1, vol));
    }
  }

  /** 销毁，释放资源 */
  dispose(): void {
    this.stop();
    this.amplitudeListeners.clear();
    this.stateListeners.clear();
    this.endListeners.clear();
    if (this.audioContext) {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }
  }

  // ---- 内部实现 ----

  private async play(): Promise<void> {
    try {
      // 惰性创建 AudioContext
      if (!this.audioContext) {
        this.audioContext = new AudioContext();
        this.gainNode = this.audioContext.createGain();
        this.gainNode.connect(this.audioContext.destination);
        this.analyserNode = this.audioContext.createAnalyser();
        this.analyserNode.fftSize = 256;
        this.gainNode.connect(this.analyserNode);
      }

      // 合并所有音频数据
      const merged = new Uint8Array(this.totalLength);
      let offset = 0;
      for (const chunk of this.buffer) {
        merged.set(chunk, offset);
        offset += chunk.length;
      }
      this.buffer = [];
      this.totalLength = 0;

      // 解码
      const audioBuffer = await this.audioContext.decodeAudioData(
        merged.buffer.slice(0) as ArrayBuffer,
      );

      // 创建播放源
      this.source = this.audioContext.createBufferSource();
      this.source.buffer = audioBuffer;

      // 通过 gain 节点播放
      this.source.connect(this.gainNode!);

      this.state = 'playing';
      this.notifyState();

      // 启动振幅分析
      this.startAmplitudeAnalysis();

      // 播放结束回调
      this.source.onended = () => {
        this.cancelAnimation();
        this.state = 'ended';
        this.notifyState();
        this.endListeners.forEach(cb => cb());
        // 延迟重置为 idle，避免过快切换
        setTimeout(() => {
          if (this.state === 'ended') {
            this.state = 'idle';
            this.notifyState();
          }
        }, 300);
      };

      this.source.start(0);

    } catch (err) {
      console.error('[StreamingAudioPlayer] Playback error:', err);
      this.state = 'error';
      this.notifyState();
    }
  }

  private startAmplitudeAnalysis(): void {
    if (!this.analyserNode || !this.audioContext) return;

    const dataArray = new Uint8Array(this.analyserNode.frequencyBinCount);
    const analyze = () => {
      if (this.state !== 'playing') return;

      this.analyserNode!.getByteTimeDomainData(dataArray);
      // 计算 RMS
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        const value = (dataArray[i] - 128) / 128;
        sum += value * value;
      }
      const rms = Math.sqrt(sum / dataArray.length);

      // 通知振幅监听器
      this.amplitudeListeners.forEach(cb => cb(rms));

      this.animationFrameId = requestAnimationFrame(analyze);
    };
    analyze();
  }

  private cancelAnimation(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  private notifyState(): void {
    const status: PlayerStatus = {
      state: this.state,
      accumulatedBytes: this.totalLength,
    };
    this.stateListeners.forEach(cb => cb(status));
  }
}
