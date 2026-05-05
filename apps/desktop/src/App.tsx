import React, { useEffect, useCallback, useRef, useState } from 'react';
import { PetStage } from './components/PetStage';
import { SpeechBubble } from './components/SpeechBubble';
import { usePetStore } from './stores/pet-store';
import { loadModelConfigs, ModelConfig } from './features/pet/model-registry';
import { StreamingAudioPlayer } from './audio/streaming-player';
import { applyPetStateEvent } from './features/pet-events/apply-pet-event';
import { isPetStateEvent, PetTTSOptions } from './features/pet-events/pet-event-schema';

/** TTS 状态（来自主进程） */
interface TTSStateEvent {
  status: 'idle' | 'playing' | 'stopped' | 'error';
  text?: string;
  message?: string;
}

interface TTSConfigSnapshot {
  enabled?: boolean;
  source?: string;
  fallbackToBubble?: boolean;
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
  const pendingTTSFallbackRef = useRef<{ text: string; duration: number } | null>(null);

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
      if (s.status === 'playing') {
        pendingTTSFallbackRef.current = null;
      }
      if (s.status === 'error' && pendingTTSFallbackRef.current) {
        const fallback = pendingTTSFallbackRef.current;
        pendingTTSFallbackRef.current = null;
        showBubble(fallback.text, fallback.duration);
      }
    });
  }, [setTTSState, showBubble]);

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

  // ---- TTS 配置快照（启动时异步加载）----
  const [ttsConfig, setTTSConfig] = useState<TTSConfigSnapshot>({});
  const updateTTSConfigSnapshot = useCallback((cfg: any) => {
    setTTSConfig({
      enabled: cfg?.enabled === true,
      source: cfg?.source,
      fallbackToBubble: cfg?.fallbackToBubble !== false,
    });
  }, []);

  useEffect(() => {
    const api = (window as any).electronAPI?.petTTS;
    api?.getConfig().then(updateTTSConfigSnapshot).catch(() => {});
    const cleanup = api?.onTTSConfig?.(updateTTSConfigSnapshot);
    return cleanup;
  }, [updateTTSConfigSnapshot]);

  // ---- 语音/气泡分发器（用 ref 隔离，不参与任何 deps 链）----
  const ttsConfigRef = useRef<TTSConfigSnapshot>({});
  ttsConfigRef.current = ttsConfig;

  const handleSpeech = useCallback((text: string, ttsOpts?: boolean | PetTTSOptions) => {
    if (!text?.trim()) return;
    const duration = Math.min(3000 + text.length * 50, 15000);
    const cfg = ttsConfigRef.current;
    const ttsRequested = ttsOpts === true || (typeof ttsOpts === 'object' && ttsOpts.enabled === true);
    const ttsAvailable = cfg.enabled === true && cfg.source !== 'none';

    if (!ttsRequested || !ttsAvailable) {
      showBubble(text, duration);
      return;
    }

    const optionObject = typeof ttsOpts === 'object' ? ttsOpts : undefined;
    const opts = optionObject
      ? { text, voice: optionObject.voice, model: optionObject.model || 'preset', ...(optionObject.model === 'instruct' ? { instruct: optionObject.instruct } : {}) }
      : { text, model: 'preset' as const };

    pendingTTSFallbackRef.current = cfg.fallbackToBubble === false ? null : { text, duration };
    (window as any).electronAPI?.petTTS?.speak(text, opts).then((result: { ok?: boolean; error?: string } | undefined) => {
      if (result?.ok === false && pendingTTSFallbackRef.current) {
        const fallback = pendingTTSFallbackRef.current;
        pendingTTSFallbackRef.current = null;
        showBubble(fallback.text, fallback.duration);
      }
    }).catch(() => {
      if (pendingTTSFallbackRef.current) {
        const fallback = pendingTTSFallbackRef.current;
        pendingTTSFallbackRef.current = null;
        showBubble(fallback.text, fallback.duration);
      }
    });
  }, [showBubble]);

  const handlePetEvent = useCallback((eventRaw: unknown) => {
    if (!isPetStateEvent(eventRaw)) return;
    applyPetStateEvent(eventRaw, {
      currentAction,
      clearActionResetTimer,
      setAction,
      scheduleIdle,
      handleSpeech,
    });
  }, [clearActionResetTimer, currentAction, handleSpeech, scheduleIdle, setAction]);

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
  // - Tray menu actions → handleMenuAction / direct local actions
  // - Adapter events → handlePetEvent
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const api = (window as any).electronAPI;
    const cleanups: Array<() => void> = [];

    if (api?.onPetEvent) {
      cleanups.push(api.onPetEvent((event: unknown) => {
        console.log('[IPC] Received pet event:', event);
        handlePetEvent(event);
      }));
    }

    if (api?.onPetAction) {
      cleanups.push(api.onPetAction((action: string, params?: unknown) => {
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

        clearActionResetTimer();
        setAction(action);
      }));
    }

    return () => cleanups.forEach((cleanup) => cleanup());
  }, [clearActionResetTimer, handleMenuAction, handlePetEvent, setAction]);

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
