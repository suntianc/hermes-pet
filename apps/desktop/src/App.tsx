import React, { useEffect, useCallback, useRef, useState } from 'react';
import { PetStage } from './components/PetStage';
import { SpeechBubble } from './components/SpeechBubble';
import { usePetStore } from './stores/pet-store';
import { ActionType } from './features/actions/action-schema';
import { loadModelConfigs, ModelConfig } from './features/pet/model-registry';

/** Simplified external event type. */
interface ExternalEvent {
  type: string;
  text?: string;
  tool?: string;
  error?: string;
  summary?: string;
  message?: string;
}

const EXTERNAL_EVENT_TYPES = new Set([
  'idle',
  'thinking',
  'speaking',
  'tool_start',
  'tool_success',
  'tool_error',
  'task_done',
]);

const App: React.FC = () => {
  const [modelIndex, setModelIndex] = useState(0);
  const [models, setModels] = useState<ModelConfig[]>([]);
  const [modelRevision, setModelRevision] = useState(0);
  const actionResetTimerRef = useRef<number | null>(null);
  const {
    currentAction,
    actionRevision,
    bubbleText,
    bubbleDuration,
    showBubble,
    hideBubble,
    setAction,
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
      case 'error': setAction('error'); break;
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
        if (EXTERNAL_EVENT_TYPES.has(action)) {
          handleExternalEvent({ type: action, ...(params as Partial<ExternalEvent> | undefined) });
          return;
        }
        // Play the action directly
        clearActionResetTimer();
        setAction(action as ActionType);
        scheduleIdle(5000);
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
