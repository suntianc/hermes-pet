import React, { useEffect, useCallback, useRef, useState } from 'react';
import { PetStage } from './components/PetStage';
import { SpeechBubble } from './components/SpeechBubble';
import { usePetStore } from './stores/pet-store';
import { loadModelConfigs, ModelConfig } from './features/pet/model-registry';
import { StreamingAudioPlayer } from './audio/streaming-player';
import { BehaviorContextManager } from './features/pet-events/behavior-context';
import { composeRuntimePlan } from './features/pet-events/behavior-plan';
import { HybridBehaviorPlanner, PlannerTrace, RuleBasedBehaviorPlanner } from './features/pet-events/behavior-planner';
import { applyPetStateEvent } from './features/pet-events/apply-pet-event';
import { isPetStateEvent, PetTTSOptions } from './features/pet-events/pet-event-schema';
import { PetSessionManager } from './features/pet-events/pet-session-manager';

/** TTS 状态（来自主进程） */
interface TTSStateEvent {
  status: 'idle' | 'playing' | 'completed' | 'stopped' | 'error';
  requestId?: string;
  text?: string;
  message?: string;
}

interface TTSConfigSnapshot {
  enabled?: boolean;
  source?: string;
  fallbackToBubble?: boolean;
}

interface AIPlannerConfigSnapshot {
  enabled: boolean;
  mode: 'rule' | 'ai' | 'hybrid';
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
  fallbackToRule: boolean;
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
  const runtimeRefreshTimerRef = useRef<number | null>(null);
  const scheduleRuntimeRefreshRef = useRef<(delay?: number) => void>(() => {});
  const currentActionRef = useRef<string>('idle');
  const sessionManagerRef = useRef(new PetSessionManager());
  const behaviorContextManagerRef = useRef(new BehaviorContextManager());
  const behaviorPlannerRef = useRef(new RuleBasedBehaviorPlanner());
  const audioPlayerRef = useRef<StreamingAudioPlayer | null>(null);
  const pendingTTSFallbackRef = useRef<Map<string, { text: string; duration: number }>>(new Map());
  const pendingTTSSequenceRef = useRef(0);
  const previousMousePassthroughRef = useRef<string | undefined>(undefined);
  const settingsPanelRef = useRef<HTMLDivElement>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsPosition, setSettingsPosition] = useState({ x: 24, y: 24 });
  const [aiConfig, setAIConfig] = useState<AIPlannerConfigSnapshot | null>(null);
  const [activeAIConfig, setActiveAIConfig] = useState<AIPlannerConfigSnapshot | null>(null);
  const [aiConfigStatus, setAIConfigStatus] = useState('');
  const [plannerTrace, setPlannerTrace] = useState<PlannerTrace>({ source: 'rule' });

  const {
    currentAction,
    actionRevision,
    currentExpression,
    expressionRevision,
    currentProps,
    propsRevision,
    bubbleText,
    bubbleDuration,
    isSpeaking,
    ttsAmplitude,
    showBubble,
    hideBubble,
    setAction,
    setExpression,
    setProps,
    setTTSState,
    setTTSAmplitude,
    setIsSpeaking,
  } = usePetStore();
  currentActionRef.current = currentAction;

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

  const clearRuntimeRefreshTimer = useCallback(() => {
    if (runtimeRefreshTimerRef.current !== null) {
      window.clearTimeout(runtimeRefreshTimerRef.current);
      runtimeRefreshTimerRef.current = null;
    }
  }, []);

  const scheduleRuntimeRefresh = useCallback((delay?: number) => {
    clearRuntimeRefreshTimer();
    if (delay === undefined) return;
    runtimeRefreshTimerRef.current = window.setTimeout(() => {
      runtimeRefreshTimerRef.current = null;
      const result = sessionManagerRef.current.refresh();
      const plan = composeRuntimePlan(result.action);
      if (currentActionRef.current !== plan.pose) {
        setAction(plan.pose);
      }
      if (plan.expression !== undefined) {
        setExpression(plan.expression);
      }
      setProps(plan.props ?? []);
      scheduleRuntimeRefreshRef.current(result.nextExpiryDelay);
    }, Math.max(0, delay));
  }, [clearRuntimeRefreshTimer, setAction, setExpression, setProps]);
  scheduleRuntimeRefreshRef.current = scheduleRuntimeRefresh;

  useEffect(() => {
    return () => {
      clearRuntimeRefreshTimer();
    };
  }, [clearRuntimeRefreshTimer]);

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
      if (s.status === 'completed') {
        if (s.requestId) {
          pendingTTSFallbackRef.current.delete(s.requestId);
        }
        return;
      }

      setTTSState(s.status === 'playing'
        ? { status: 'playing', text: s.text || '' }
        : { status: s.status as any });
      if (s.status === 'error') {
        const fallbackKey = s.requestId && pendingTTSFallbackRef.current.has(s.requestId)
          ? s.requestId
          : (pendingTTSFallbackRef.current.keys().next().value as string | undefined);
        if (!fallbackKey) return;
        const fallback = pendingTTSFallbackRef.current.get(fallbackKey);
        pendingTTSFallbackRef.current.delete(fallbackKey);
        if (fallback) {
          showBubble(fallback.text, fallback.duration);
        }
      }
      if ((s.status === 'idle' || s.status === 'stopped') && pendingTTSFallbackRef.current.size > 0) {
        pendingTTSFallbackRef.current.clear();
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

    const fallbackKey = `pending_${++pendingTTSSequenceRef.current}`;
    if (cfg.fallbackToBubble !== false) {
      pendingTTSFallbackRef.current.set(fallbackKey, { text, duration });
    }

    (window as any).electronAPI?.petTTS?.speak(text, opts).then((result: { ok?: boolean; requestId?: string; error?: string } | undefined) => {
      if (result?.ok === true && result.requestId && pendingTTSFallbackRef.current.has(fallbackKey)) {
        const fallback = pendingTTSFallbackRef.current.get(fallbackKey)!;
        pendingTTSFallbackRef.current.delete(fallbackKey);
        pendingTTSFallbackRef.current.set(result.requestId, fallback);
        return;
      }
      if (result?.ok === false && pendingTTSFallbackRef.current.has(fallbackKey)) {
        const fallback = pendingTTSFallbackRef.current.get(fallbackKey)!;
        pendingTTSFallbackRef.current.delete(fallbackKey);
        showBubble(fallback.text, fallback.duration);
      }
    }).catch(() => {
      if (pendingTTSFallbackRef.current.has(fallbackKey)) {
        const fallback = pendingTTSFallbackRef.current.get(fallbackKey)!;
        pendingTTSFallbackRef.current.delete(fallbackKey);
        showBubble(fallback.text, fallback.duration);
      }
    });
  }, [showBubble]);

  const handlePetEvent = useCallback((eventRaw: unknown) => {
    if (!isPetStateEvent(eventRaw)) return;
    void applyPetStateEvent(eventRaw, {
      currentAction,
      sessionManager: sessionManagerRef.current,
      contextManager: behaviorContextManagerRef.current,
      planner: behaviorPlannerRef.current,
      clearActionResetTimer,
      setAction,
      setExpression,
      setProps,
      scheduleIdle,
      scheduleRuntimeRefresh,
      handleSpeech,
    });
  }, [clearActionResetTimer, currentAction, handleSpeech, scheduleIdle, scheduleRuntimeRefresh, setAction, setExpression, setProps]);

  const applyPlannerMode = useCallback((config: any) => {
    setActiveAIConfig(config);
    behaviorPlannerRef.current = config?.enabled && config?.mode !== 'rule'
      ? new HybridBehaviorPlanner(new RuleBasedBehaviorPlanner(), setPlannerTrace)
      : new RuleBasedBehaviorPlanner(setPlannerTrace);
  }, []);

  const loadAIConfig = useCallback(() => {
    const api = (window as any).electronAPI?.petAI;
    return api?.getConfig?.().then((config: AIPlannerConfigSnapshot) => {
      setAIConfig(config);
      applyPlannerMode(config);
      return config;
    }).catch(() => null);
  }, [applyPlannerMode]);

  useEffect(() => {
    loadAIConfig().then((config) => {
      if (!config) {
        behaviorPlannerRef.current = new RuleBasedBehaviorPlanner();
      }
    }).catch(() => {
      behaviorPlannerRef.current = new RuleBasedBehaviorPlanner();
    });
  }, [loadAIConfig]);

  const saveAIConfig = useCallback(async () => {
    if (!aiConfig) return;
    setAIConfigStatus('Saving...');
    const saved = await (window as any).electronAPI?.petAI?.setConfig(aiConfig);
    setAIConfig(saved);
    applyPlannerMode(saved);
    setAIConfigStatus('Saved');
  }, [aiConfig, applyPlannerMode]);

  const testAIConfig = useCallback(async () => {
    if (!aiConfig) return;
    setAIConfigStatus('Testing...');
    const result = await (window as any).electronAPI?.petAI?.testConnection(aiConfig);
    setAIConfigStatus(result?.ok ? 'Connection OK' : `Failed: ${result?.error || 'Unknown error'}`);
  }, [aiConfig]);

  const hasUnsavedAIConfig = Boolean(aiConfig && activeAIConfig && JSON.stringify(aiConfig) !== JSON.stringify(activeAIConfig));

  const beginSettingsDrag = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const startX = event.clientX;
    const startY = event.clientY;
    const origin = settingsPosition;
    const pointerId = event.pointerId;
    event.currentTarget.setPointerCapture(pointerId);

    const handleMove = (moveEvent: PointerEvent) => {
      const nextX = Math.max(8, Math.min(window.innerWidth - 380, origin.x + moveEvent.clientX - startX));
      const nextY = Math.max(8, Math.min(window.innerHeight - 480, origin.y + moveEvent.clientY - startY));
      setSettingsPosition({ x: nextX, y: nextY });
    };

    const handleUp = () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
  }, [settingsPosition]);

  useEffect(() => {
    const api = (window as any).electronAPI;
    if (settingsOpen) {
      previousMousePassthroughRef.current = document.documentElement.dataset.mousePassthrough;
      document.documentElement.dataset.mousePassthrough = 'false';
      api?.petWindow?.setIgnoreMouseEvents?.(false, { forward: true });
      return;
    }

    const previous = previousMousePassthroughRef.current;
    previousMousePassthroughRef.current = undefined;
    if (previous !== undefined) {
      document.documentElement.dataset.mousePassthrough = previous;
      api?.petWindow?.setIgnoreMouseEvents?.(previous === 'true', { forward: true });
    }
  }, [settingsOpen]);

  useEffect(() => {
    if (!settingsOpen) return;

    const handlePointerMove = (event: PointerEvent) => {
      const panel = settingsPanelRef.current;
      const insideSettings = Boolean(panel && panel.contains(event.target as Node));
      const onPet = document.elementFromPoint(event.clientX, event.clientY)?.closest?.('.live2d-container');
      const shouldPassThrough = !insideSettings && !onPet;
      document.documentElement.dataset.mousePassthrough = String(shouldPassThrough);
      (window as any).electronAPI?.petWindow?.setIgnoreMouseEvents?.(shouldPassThrough, { forward: true });
    };

    window.addEventListener('pointermove', handlePointerMove, true);
    return () => window.removeEventListener('pointermove', handlePointerMove, true);
  }, [settingsOpen]);

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
        setSettingsOpen(true);
        void loadAIConfig();
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
  }, [loadAIConfig, showBubble]);

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
          if (!isNaN(scale)) {
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

        if (action === 'mousePassthrough:on' || action === 'mousePassthrough:off') {
          const enabled = action === 'mousePassthrough:on';
          document.documentElement.dataset.mousePassthrough = String(enabled);
          api.petWindow?.setIgnoreMouseEvents?.(enabled, { forward: true });
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
        currentExpression={currentExpression}
        expressionRevision={expressionRevision}
        currentProps={currentProps}
        propsRevision={propsRevision}
        interactionLocked={settingsOpen}
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

      {settingsOpen && aiConfig && (
        <div ref={settingsPanelRef} style={{
          position: 'absolute',
          left: settingsPosition.x,
          top: settingsPosition.y,
          width: 360,
          maxWidth: 'calc(100vw - 16px)',
          maxHeight: 460,
          background: 'rgba(250, 250, 250, 0.97)',
          color: '#1f2933',
          border: '1px solid rgba(15, 23, 42, 0.14)',
          borderRadius: 8,
          boxShadow: '0 18px 50px rgba(15, 23, 42, 0.24)',
          padding: 0,
          fontFamily: 'system-ui, sans-serif',
          fontSize: 12,
          zIndex: 20,
          overflow: 'hidden',
          pointerEvents: 'auto',
        }}>
          <div
            onPointerDown={beginSettingsDrag}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '10px 12px',
              borderBottom: '1px solid rgba(15, 23, 42, 0.1)',
              cursor: 'move',
              userSelect: 'none',
            }}
          >
            <strong style={{ fontSize: 15 }}>AI Planner</strong>
            <button
              onPointerDown={(event) => event.stopPropagation()}
              onClick={() => setSettingsOpen(false)}
              style={{ border: 0, background: 'transparent', fontSize: 20, cursor: 'pointer' }}
            >
              ×
            </button>
          </div>

          <div style={{ padding: 12, maxHeight: 410, overflow: 'auto' }}>
          <div style={{
            padding: 8,
            marginBottom: 10,
            background: '#f5f7fa',
            border: '1px solid #d9e2ec',
            borderRadius: 6,
            lineHeight: 1.5,
          }}>
            <div>Active: {activeAIConfig?.enabled ? activeAIConfig.mode : 'rule'} / {activeAIConfig?.model || 'none'}</div>
            <div>
              Last planner: {plannerTrace.source}
              {plannerTrace.source === 'ai' ? ` (${plannerTrace.elapsedMs}ms)` : ''}
              {plannerTrace.source === 'fallback' ? ` (${plannerTrace.elapsedMs}ms): ${plannerTrace.error}` : ''}
            </div>
            {hasUnsavedAIConfig && <div style={{ color: '#b7791f' }}>Unsaved changes. Click Save to apply.</div>}
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <input
              type="checkbox"
              checked={aiConfig.enabled}
              onChange={(e) => setAIConfig({ ...aiConfig, enabled: e.target.checked })}
            />
            Enable AI behavior planning
          </label>

          <label style={{ display: 'block', marginBottom: 10 }}>
            <span>Mode</span>
            <select
              value={aiConfig.mode}
              onChange={(e) => setAIConfig({ ...aiConfig, mode: e.target.value as AIPlannerConfigSnapshot['mode'] })}
              style={{ width: '100%', marginTop: 4, padding: 8 }}
            >
              <option value="rule">Rule</option>
              <option value="ai">AI</option>
              <option value="hybrid">Hybrid</option>
            </select>
          </label>

          <label style={{ display: 'block', marginBottom: 10 }}>
            <span>Base URL</span>
            <input
              value={aiConfig.baseUrl}
              onChange={(e) => setAIConfig({ ...aiConfig, baseUrl: e.target.value })}
              placeholder="http://localhost:1234/v1"
              style={{ width: '100%', boxSizing: 'border-box', marginTop: 4, padding: 8 }}
            />
          </label>

          <label style={{ display: 'block', marginBottom: 10 }}>
            <span>Model</span>
            <input
              value={aiConfig.model}
              onChange={(e) => setAIConfig({ ...aiConfig, model: e.target.value })}
              placeholder="gpt-4o-mini"
              style={{ width: '100%', boxSizing: 'border-box', marginTop: 4, padding: 8 }}
            />
          </label>

          <label style={{ display: 'block', marginBottom: 10 }}>
            <span>API Key</span>
            <input
              type="password"
              value={aiConfig.apiKey}
              onChange={(e) => setAIConfig({ ...aiConfig, apiKey: e.target.value })}
              style={{ width: '100%', boxSizing: 'border-box', marginTop: 4, padding: 8 }}
            />
          </label>

          <label style={{ display: 'block', marginBottom: 12 }}>
            <span>Timeout: {aiConfig.timeoutMs} ms</span>
            <input
              type="range"
              min={1000}
              max={20000}
              step={500}
              value={aiConfig.timeoutMs}
              onChange={(e) => setAIConfig({ ...aiConfig, timeoutMs: Number(e.target.value) })}
              style={{ width: '100%' }}
            />
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <input
              type="checkbox"
              checked={aiConfig.fallbackToRule}
              onChange={(e) => setAIConfig({ ...aiConfig, fallbackToRule: e.target.checked })}
            />
            Fallback to rule planner
          </label>

          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={testAIConfig} style={{ padding: '8px 10px', cursor: 'pointer' }}>Test Connection</button>
            <button onClick={saveAIConfig} style={{ padding: '8px 10px', cursor: 'pointer' }}>Save</button>
          </div>
          {aiConfigStatus && <div style={{ marginTop: 10, color: '#52606d' }}>{aiConfigStatus}</div>}
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
