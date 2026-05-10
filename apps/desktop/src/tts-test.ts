/**
 * TTS Channel Integration Test
 *
 * Run from DevTools console:
 *   window.__VIVIPET_TTS_TEST__.speak('Hello from Tauri TTS engine!')
 *   window.__VIVIPET_TTS_TEST__.stop()
 *   window.__VIVIPET_TTS_TEST__.getConfig().then(console.log)
 *
 * REMOVAL: This test harness is Phase 2 temporary scaffolding.
 * Phase 6 (Frontend IPC Migration) will delete this file and
 * wire the real StreamingAudioPlayer directly to Tauri Channels.
 */
import { invoke, Channel } from '@tauri-apps/api/core';

/** Mirror of Rust TtsStreamEvent (stream.rs) */
export interface TtsStreamEvent {
  event: 'audio' | 'finished' | 'error';
  data?: {
    data?: number[];        // AudioChunk bytes (as number[])
    seq?: number;            // Chunk sequence number
    sample_rate?: number;    // Sample rate in Hz
    isFinal?: boolean;       // Last chunk for this segment
    totalChunks?: number;    // Finished event
    durationMs?: number;     // Finished event
    message?: string;        // Error event
    recoverable?: boolean;   // Error event
  };
}

/** Test log entry with timestamp */
interface TestLogEntry {
  time: string;
  type: 'info' | 'audio' | 'done' | 'error';
  message: string;
  detail?: unknown;
}

const testLog: TestLogEntry[] = [];
let totalBytes = 0;
let chunkCount = 0;

function log(type: TestLogEntry['type'], message: string, detail?: unknown) {
  const entry: TestLogEntry = {
    time: new Date().toISOString().slice(11, 23),
    type,
    message,
    detail,
  };
  testLog.push(entry);

  const icon = { info: '\u2139\uFE0F', audio: '\uD83C\uDFB5', done: '\u2705', error: '\u274C' }[type];
  console.log(`[TTS-Test][${entry.time}] ${icon} ${message}`, detail ?? '');
}

/**
 * Run a TTS test: create Channel, invoke tts_speak, log events.
 *
 * Usage:
 *   window.__VIVIPET_TTS_TEST__.speak('Hello world!')
 *   window.__VIVIPET_TTS_TEST__.speak('Custom voice', 'Samantha')
 *
 * @param text - Text to speak (default: demo text)
 * @param voice - Optional voice override
 */
export async function runTtsTest(text?: string, voice?: string): Promise<void> {
  const ttsText = text ?? 'Hello from the Rust TTS engine! Audio chunks are streaming via Tauri Channel.';

  // Reset counters
  totalBytes = 0;
  chunkCount = 0;
  testLog.length = 0;

  log('info', `Starting TTS test: text="${ttsText.slice(0, 60)}..." voice=${voice ?? 'default'}`);

  // Create Channel — receives TtsStreamEvent from Rust
  const channel = new Channel<TtsStreamEvent>();

  channel.onmessage = (event: TtsStreamEvent) => {
    switch (event.event) {
      case 'audio': {
        const d = event.data!;
        const size = d.data?.length ?? 0;
        totalBytes += size;
        chunkCount++;
        log('audio', `Chunk #${d.seq}: ${size} bytes (total: ${totalBytes}, running count: ${chunkCount})`, {
          seq: d.seq,
          bytes: size,
          sampleRate: d.sample_rate,
          isFinal: d.isFinal,
        });
        break;
      }
      case 'finished': {
        const d = event.data!;
        log('done', `TTS complete: ${d.totalChunks} chunks, ${totalBytes} bytes, ${d.durationMs}ms`);
        break;
      }
      case 'error': {
        const d = event.data!;
        log('error', `TTS error: ${d.message}`, { recoverable: d.recoverable });
        break;
      }
      default:
        log('info', `Unknown event: ${JSON.stringify(event)}`);
    }
  };

  try {
    log('info', 'Invoking tts_speak...');
    const args: Record<string, unknown> = { text: ttsText, onEvent: channel };
    if (voice) args.voice = voice;
    await invoke('tts_speak', args);
    log('info', 'tts_speak command returned (background task started)');

    // If no events arrive within 5 seconds, warn
    const checkTimeout = setTimeout(() => {
      if (chunkCount === 0) {
        log('error', 'No audio chunks received within 5s — check TTS config (enabled? source?)');
        console.warn('[TTS-Test] No events received. Run getConfig() to check TTS settings.');
      }
    }, 5000);

    // Clear the timeout if we get data
    const original = channel.onmessage;
    channel.onmessage = (event) => {
      original(event);
      if (event.event === 'audio' || event.event === 'error') {
        clearTimeout(checkTimeout);
      }
      // Re-bind original after first call
      channel.onmessage = original;
    };
  } catch (err) {
    log('error', `tts_speak invoke failed`, err);
    console.error('[TTS-Test] Full error:', err);
  }
}

/**
 * Get the current TTS configuration from Rust backend
 */
export async function getConfig(): Promise<Record<string, unknown>> {
  try {
    const config = await invoke<Record<string, unknown>>('tts_get_config');
    log('info', 'TTS config retrieved', config);
    return config;
  } catch (err) {
    log('error', 'Failed to get TTS config', err);
    throw err;
  }
}

/**
 * Set TTS configuration
 */
export async function setConfig(config: Record<string, unknown>): Promise<void> {
  try {
    await invoke('tts_set_config', { config });
    log('info', 'TTS config updated', config);
  } catch (err) {
    log('error', 'Failed to set TTS config', err);
    throw err;
  }
}

/**
 * Stop current TTS playback
 */
export async function stopTts(): Promise<void> {
  try {
    await invoke('tts_stop');
    log('info', 'TTS stopped');
  } catch (err) {
    log('error', 'Failed to stop TTS', err);
  }
}

// Export all functions under a namespace for window attachment
export const TtsTest = {
  speak: runTtsTest,
  stop: stopTts,
  getConfig,
  setConfig,
  log: () => [...testLog],
};

export default TtsTest;
