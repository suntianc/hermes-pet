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
        if (event.text) showBubble(event.text, 5000);
        break;
      case 'tool_start': {
        const tool = event.tool || 'coding';
        const actionMap: Record<string, ActionType> = { searching: 'searching', reading: 'reading', terminal: 'terminal' };
        setContinuousAction(actionMap[tool] || 'coding');
        break;
      }
      case 'tool_success': setAction('success'); showBubble('Done!', 2000); scheduleIdle(2000); break;
      case 'tool_error': setAction('error'); showBubble(event.error || 'Error occurred', 3000); scheduleIdle(3000); break;
      case 'task_done': setAction('happy'); showBubble(event.summary || 'Task completed!', 3000); scheduleIdle(3000, hideBubble); break;
      case 'error': setAction('error'); showBubble(event.message || 'Error', 3000); break;
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

  // Listen for actions from tray menu (sent via pet:action IPC)
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const api = (window as any).electronAPI;
    if (api?.onPetAction) {
      const cleanup = api.onPetAction((action: string) => {
        handleMenuAction(action);
      });
      return cleanup;
    }
  }, [handleMenuAction]);

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
