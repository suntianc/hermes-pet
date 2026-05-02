import React, { useEffect, useCallback, useRef, useState } from 'react';
import { PetStage } from './components/PetStage';
import { SpeechBubble } from './components/SpeechBubble';
import { PetContextMenu } from './components/PetContextMenu';
import { HermesClient } from './features/hermes/hermes-client';
import { EventInterpreter } from './features/hermes/event-interpreter';
import { HermesPetEvent } from './features/hermes/hermes-events';
import { usePetStore } from './stores/pet-store';
import { ActionType } from './features/actions/action-schema';
import { loadModelConfigs, ModelConfig } from './features/pet/model-registry';

const hermesClient = new HermesClient();
const eventInterpreter = new EventInterpreter();

const GATEWAY_URL = 'http://localhost:8643';

const App: React.FC = () => {
  const [isConnected, setIsConnected] = useState(false);
  const [modelIndex, setModelIndex] = useState(0);
  const [models, setModels] = useState<ModelConfig[]>([]);
  const actionResetTimerRef = useRef<number | null>(null);
  const {
    currentAction,
    actionRevision,
    bubbleText,
    bubbleDuration,
    isContextMenuOpen,
    contextMenuPosition,
    showBubble,
    hideBubble,
    setAction,
    openContextMenu,
    closeContextMenu,
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

  const handleHermesEvent = useCallback((event: HermesPetEvent, source: 'gateway' | 'bridge' = 'gateway') => {
    const interpreted = eventInterpreter.interpret(event);
    clearActionResetTimer();
    const setContinuousAction = (action: ActionType) => {
      if (currentAction !== action) {
        setAction(action);
      }
    };
    const showBridgeEvent = (label: string) => {
      if (source === 'bridge') {
        showBubble(label, 1200);
      }
    };

    switch (interpreted.type) {
      case 'idle':
        console.log('[App] idle event, currentAction in closure:', currentAction);
        setContinuousAction('idle');
        showBridgeEvent('Idle');
        break;
      case 'thinking':
        console.log('[App] thinking event, currentAction in closure:', currentAction);
        setContinuousAction('thinking');
        showBridgeEvent('Thinking...');
        break;
      case 'speaking':
        console.log('[App] speaking event, currentAction in closure:', currentAction);
        setContinuousAction('speaking');
        if (interpreted.text) {
          showBubble(interpreted.text, 5000);
        } else {
          showBridgeEvent('Speaking');
        }
        break;
      case 'tool_start':
        console.log('[App] tool_start event, currentAction in closure:', currentAction, 'tool:', interpreted.tool);
        if (interpreted.tool === 'searching') {
          setContinuousAction('searching');
        } else if (interpreted.tool === 'reading') {
          setContinuousAction('reading');
        } else if (interpreted.tool === 'terminal') {
          setContinuousAction('terminal');
        } else {
          setContinuousAction('coding');
        }
        showBridgeEvent(`Tool: ${interpreted.tool || 'coding'}`);
        break;
      case 'tool_success':
        setAction('success');
        showBubble('Done!', 2000);
        scheduleIdle(2000);
        break;
      case 'tool_error':
        setAction('error');
        showBubble(interpreted.error || 'Error occurred', 3000);
        scheduleIdle(3000);
        break;
      case 'task_done':
        setAction('happy');
        showBubble(interpreted.summary || 'Task completed!', 3000);
        scheduleIdle(3000, hideBubble);
        break;
      case 'error':
        setAction('error');
        showBubble(interpreted.message, 3000);
        break;
    }
  }, [clearActionResetTimer, currentAction, hideBubble, scheduleIdle, setAction, showBubble]);

  useEffect(() => {
    let cancelled = false;

    loadModelConfigs().then((loadedModels) => {
      if (cancelled) return;
      setModels(loadedModels);
      setModelIndex((index) => Math.min(index, loadedModels.length - 1));
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    hermesClient.connect(GATEWAY_URL);

    const unsubscribe = hermesClient.onEvent((event) => handleHermesEvent(event, 'gateway'));
    const unsubscribeIpc = window.electronAPI?.hermes.onEvent((eventName, data) => {
      handleHermesEvent({ ...(data as object), type: eventName as HermesPetEvent['type'] } as HermesPetEvent, 'bridge');
    });

    setIsConnected(hermesClient.getConnectionStatus());

    return () => {
      unsubscribe();
      unsubscribeIpc?.();
      hermesClient.disconnect();
      clearActionResetTimer();
    };
  }, [clearActionResetTimer, handleHermesEvent]);

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

  const handleContextMenu = useCallback((x: number, y: number) => {
    openContextMenu(x, y);
  }, [openContextMenu]);

  const handleCloseContextMenu = useCallback(() => {
    closeContextMenu();
  }, [closeContextMenu]);

  const handleMenuAction = useCallback((action: string) => {
    closeContextMenu();
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
      case 'quit':
        window.electronAPI?.petWindow.close();
        break;
    }
  }, [closeContextMenu, showBubble]);

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
        onContextMenu={handleContextMenu}
        forceInteractive={isContextMenuOpen}
      />

      {bubbleText && (
        <SpeechBubble
          text={bubbleText}
          duration={bubbleDuration}
          onClose={hideBubble}
        />
      )}

      {isContextMenuOpen && (
        <PetContextMenu
          x={contextMenuPosition.x}
          y={contextMenuPosition.y}
          models={models}
          onAction={handleMenuAction}
          onClose={handleCloseContextMenu}
        />
      )}

      {!isConnected && (
        <div style={{
          position: 'absolute',
          bottom: 8,
          left: 8,
          background: 'rgba(0,0,0,0.6)',
          color: '#ff6b6b',
          padding: '4px 8px',
          borderRadius: 4,
          fontSize: 10,
          fontFamily: 'system-ui, sans-serif',
        }}>
          Disconnected
        </div>
      )}
    </div>
  );
};

export default App;
