import React, { useEffect, useCallback, useRef, useState } from 'react';
import { PetStage } from './components/PetStage';
import { SpeechBubble } from './components/SpeechBubble';
import { usePetStore } from './stores/pet-store';
import { ActionType } from './features/actions/action-schema';
import { loadModelConfigs, ModelConfig } from './features/pet/model-registry';
import { StreamingAudioPlayer } from './audio/streaming-player';

/** Simplified external event type. */
interface ExternalEvent {
  type: string;
  text?: string;
  tool?: string;
  error?: string;
  summary?: string;
  message?: string;
  tts?: {
    voice?: string;
    model?: 'preset' | 'clone' | 'instruct';
    instruct?: string;
  };
}

/** TTS 状态（来自主进程） */
interface TTSStateEvent {
  status: 'idle' | 'playing' | 'stopped' | 'error';
  text?: string;
  message?: string;
}

/** TTS 音频块（来自主进程） */
interface TTSAudioChunkEvent {
  data: Uint8Array;
  format: string;
  sampleRate: number;
  seq: number;
  isFinal: boolean;
}

const App: React.FC = () => {
  const [modelIndex, setModelIndex] = useState(0);
  const [models, setModels] = useState<ModelConfig[]>([]);
  const [modelRevision, setModelRevision] = useState(0);
  const actionResetTimerRef = useRef<number | null>(null);
  const audioPlayerRef = useRef<StreamingAudioPlayer | null>(null);

  const {
    currentAction,
    actionRevision,
    bubbleText,
    bubbleDuration,
    isSpeaking,
    ttsAmplitude,
    showBubble,
    hideBubble,
    setAction,
    setTTSState,
    setTTSAmplitude,
    setIsSpeaking,
  } = usePetStore();

  const clearActionResetTimer = useCallback(() => {
    if (actionResetTimerRef.current !== null) {
      window.clearTimeout(actionResetTimerRef.current);
      actionResetTimerRef.current = null;
    }
  }, []);

  const scheduleIdle = useCallback((delay: number, afterIdle?: () => void) => {
    clearActionResetTimer();
    actionResetTimerRef.current = window.setTimeout(() => {
      actionResetTimerRef.current = null;
      setAction('idle');
      afterIdle?.();
    }, delay);
  }, [clearActionResetTimer, setAction]);

  // ---- TTS 音频播放器 ----
  useEffect(() => {
    const player = new StreamingAudioPlayer();
    audioPlayerRef.current = player;
    player.onAmplitude((rms) => setTTSAmplitude(rms));
    player.onEnded(() => setIsSpeaking(false));
    return () => { player.dispose(); audioPlayerRef.current = null; };
  }, [setIsSpeaking, setTTSAmplitude]);

  // ---- TTS 状态监听 ----
  useEffect(() => {
    const api = (window as any).electronAPI;
    if (!api?.petTTS?.onTTSState) return;
    return api.petTTS.onTTSState((stateRaw: unknown) => {
      const s = stateRaw as TTSStateEvent;
      setTTSState(s.status === 'playing' ? { status: 'playing', text: s.text || '' } : { status: s.status as any });
    });
  }, [setTTSState]);

  // ---- TTS 音频块监听 ----
  useEffect(() => {
    const api = (window as any).electronAPI;
    if (!api?.petTTS?.onTTSAudioChunk) return;
    return api.petTTS.onTTSAudioChunk((chunkRaw: unknown) => {
      const c = chunkRaw as TTSAudioChunkEvent;
      audioPlayerRef.current?.pushChunk({
        data: c.data,
        format: c.format as any,
        sampleRate: c.sampleRate,
        seq: c.seq,
        isFinal: c.isFinal,
      });
    });
  }, []);

  // ---- TTS 开关状态（启动时异步加载）----
  const [ttsEnabled, setTTSEnabled] = useState(false);
  useEffect(() => {
    (window as any).electronAPI?.petTTS?.getConfig().then((cfg: any) => {
      setTTSEnabled(cfg?.enabled === true && cfg?.source !== 'none');
    }).catch(() => {});
  }, []);

  // ---- 语音/气泡分发器（用 ref 隔离，不参与任何 deps 链）----
  const ttsEnabledRef = useRef(false);
  ttsEnabledRef.current = ttsEnabled;

  const handleSpeech = useCallback((text: string, ttsOpts?: ExternalEvent['tts']) => {
    if (!text?.trim()) return;
    if (ttsEnabledRef.current) {
      // TTS 模式 → 纯语音
      const opts = ttsOpts ? { text, voice: ttsOpts.voice, model: ttsOpts.model || 'preset', ...(ttsOpts.model === 'instruct' ? { instruct: ttsOpts.instruct } : {}) } : { text, model: 'preset' as const };
      (window as any).electronAPI?.petTTS?.speak(text, opts).catch(() => {});
    } else {
      // 气泡模式 → 纯文字
      showBubble(text, Math.min(3000 + text.length * 50, 15000));
    }
  }, [showBubble]);

  /** Convert an external event into a pet action. */
  const handleExternalEvent = useCallback((event: ExternalEvent, source: 'bridge' | 'other' = 'bridge') => {
    clearActionResetTimer();
    const setContinuousAction = (action: ActionType) => {
      if (currentAction !== action) setAction(action);
    };

    switch (event.type) {
      case 'idle': setContinuousAction('idle'); break;
      case 'thinking': setContinuousAction('thinking'); break;
      case 'speaking':
        setContinuousAction('speaking');
        // text 参数保留用于后续 TTS
        break;
      case 'tool_start': {
        const tool = event.tool || 'coding';
        const actionMap: Record<string, ActionType> = { searching: 'searching', reading: 'reading', terminal: 'terminal' };
        setContinuousAction(actionMap[tool] || 'coding');
        break;
      }
      case 'tool_success': setAction('success'); scheduleIdle(2000); break;
      case 'tool_error': setAction('error'); scheduleIdle(3000); break;
      case 'task_done': setAction('happy'); scheduleIdle(3000); break;
      case 'happy': setAction('happy'); scheduleIdle(3000); break;
      case 'success': setAction('success'); scheduleIdle(2000); break;
      case 'error': setAction('error'); break;
      case 'confused': setContinuousAction('confused'); break;
      case 'angry': setContinuousAction('angry'); break;
      case 'searching': setContinuousAction('searching'); break;
      case 'reading': setContinuousAction('reading'); break;
      case 'coding': setContinuousAction('coding'); break;
      case 'terminal': setContinuousAction('terminal'); break;
      case 'sleep': setContinuousAction('sleep'); break;
      case 'wake': setContinuousAction('wake'); break;
      default: break;
    }
  }, [clearActionResetTimer, currentAction, hideBubble, scheduleIdle, setAction, showBubble]);

  useEffect(() => {
    let cancelled = false;

    loadModelConfigs().then((loadedModels) => {
      if (cancelled) return;
      setModels(loadedModels);
      setModelIndex((index) => Math.min(index, loadedModels.length - 1));
      // Sync model names to tray menu
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).electronAPI?.petWindow?.setModelNames?.(loadedModels.map((m) => m.name));
    });

    return () => {
      cancelled = true;
    };
  }, [modelRevision]);

  const handleClick = useCallback(() => {
    clearActionResetTimer();
    setAction('clicked');
    scheduleIdle(300);
  }, [clearActionResetTimer, scheduleIdle, setAction]);

  const handleDoubleClick = useCallback(() => {
    clearActionResetTimer();
    setAction('doubleClicked');
    scheduleIdle(500);
  }, [clearActionResetTimer, scheduleIdle, setAction]);

  const handleDragStart = useCallback(() => {
    clearActionResetTimer();
    setAction('dragging');
  }, [clearActionResetTimer, setAction]);

  const handleDragEnd = useCallback(() => {
    clearActionResetTimer();
    setAction('idle');
  }, [clearActionResetTimer, setAction]);

  const handleMenuAction = useCallback((action: string) => {
    // Handle model switching
    const modelMatch = action.match(/^model:(\d+)$/);
    if (modelMatch) {
      const newIndex = parseInt(modelMatch[1], 10);
      setModelIndex(newIndex);
      return;
    }
    switch (action) {
      case 'settings':
        showBubble('Settings coming soon...', 2000);
        break;
      case 'importModel':
        // Import via IPC, trigger model reload on completion
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any).electronAPI?.petModel?.import().then((result: any) => {
          if (result) {
            showBubble('Model imported! Reloading...', 1500);
            setModelRevision((v) => v + 1);
          }
        });
        break;
      case 'refreshModels':
        showBubble('Model imported! Reloading...', 1500);
        setModelRevision((v) => v + 1);
        break;
    }
  }, [showBubble]);

  // Listen for IPC events from main process:
  // - Tray menu actions → handleMenuAction
  // - Event bridge (type-based) → handleExternalEvent
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const api = (window as any).electronAPI;
    if (api?.onPetAction) {
      const cleanup = api.onPetAction((action: string, params?: unknown) => {
        console.log(`[IPC] Received action: ${action}`, params);

        // Handle size change (base: 520x760)
        if (action.startsWith('resizePet:')) {
          const scale = parseFloat(action.split(':')[1]);
          if (!isNaN(scale) && api.petWindow?.setSizeAnchored) {
            const w = Math.round(520 * scale);
            const h = Math.round(760 * scale);
            api.petWindow.setSizeAnchored(w, h);
            // Update canvas container to fill new window
            // by storing the scale for PetStage to read
            document.documentElement.dataset.petScale = String(scale);
          }
          return;
        }

        // Handle mouse follow toggle
        if (action === 'mouseFollow:on' || action === 'mouseFollow:off') {
          const enabled = action === 'mouseFollow:on';
          document.documentElement.dataset.mouseFollow = String(enabled);
          if (!enabled) {
            // Signal PetStage to reset the pet's face to front
            document.documentElement.dataset.resetPointer = 'now';
            setAction('idle');
          }
          return;
        }

        // Route to menu handler if it looks like a menu action
        if (action.startsWith('model:') ||
            action === 'settings' ||
            action === 'importModel' ||
            action === 'refreshModels') {
          handleMenuAction(action);
          return;
        }
        // 所有事件统一处理（handleExternalEvent 的 switch 有 default 兜底）
        const event = { type: action, ...(params as Partial<ExternalEvent> | undefined) };
        handleExternalEvent(event);
        // 任何事件只要有 text，都走语音/气泡（独立于动画状态）
        const speechText = event.text || event.message || '';
        if (speechText) handleSpeech(speechText, event.tts);
      });
      return cleanup;
    }
  }, [clearActionResetTimer, handleExternalEvent, handleMenuAction, scheduleIdle, setAction]);

  return (
    <div style={{
      width: '100%',
      height: '100%',
      position: 'relative',
      overflow: 'hidden',
    }}>
      <PetStage
        currentAction={currentAction}
        actionRevision={actionRevision}
        models={models}
        modelIndex={modelIndex}
        isSpeaking={isSpeaking}
        ttsAmplitude={ttsAmplitude}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      />

      {bubbleText && (
        <SpeechBubble
          text={bubbleText}
          duration={bubbleDuration}
          onClose={hideBubble}
        />
      )}

      {/* External event indicators can go here */}
    </div>
  );
};

export default App;
