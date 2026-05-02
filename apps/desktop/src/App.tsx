import React, { useEffect, useCallback, useState } from 'react';
import { PetStage } from './components/PetStage';
import { SpeechBubble } from './components/SpeechBubble';
import { PetContextMenu } from './components/PetContextMenu';
import { HermesClient } from './features/hermes/hermes-client';
import { EventInterpreter } from './features/hermes/event-interpreter';
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
  const {
    currentAction,
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

    const unsubscribe = hermesClient.onEvent((event) => {
      const interpreted = eventInterpreter.interpret(event);

      switch (interpreted.type) {
        case 'idle':
          setAction('idle');
          break;
        case 'thinking':
          setAction('thinking');
          break;
        case 'speaking':
          setAction('speaking');
          if (interpreted.text) {
            showBubble(interpreted.text, 5000);
          }
          break;
        case 'tool_start':
          if (interpreted.tool === 'searching') {
            setAction('searching');
          } else if (interpreted.tool === 'reading') {
            setAction('reading');
          } else if (interpreted.tool === 'terminal') {
            setAction('terminal');
          } else {
            setAction('coding');
          }
          break;
        case 'tool_success':
          setAction('success');
          showBubble('Done!', 2000);
          setTimeout(() => setAction('idle'), 2000);
          break;
        case 'tool_error':
          setAction('error');
          showBubble(interpreted.error || 'Error occurred', 3000);
          setTimeout(() => setAction('idle'), 3000);
          break;
        case 'task_done':
          setAction('happy');
          showBubble(interpreted.summary || 'Task completed!', 3000);
          setTimeout(() => {
            setAction('idle');
            hideBubble();
          }, 3000);
          break;
        case 'error':
          setAction('error');
          showBubble(interpreted.message, 3000);
          break;
      }
    });

    setIsConnected(hermesClient.getConnectionStatus());

    return () => {
      unsubscribe();
      hermesClient.disconnect();
    };
  }, [setAction, showBubble, hideBubble]);

  const handleClick = useCallback(() => {
    setAction('clicked');
    setTimeout(() => setAction('idle'), 300);
  }, [setAction]);

  const handleDoubleClick = useCallback(() => {
    setAction('doubleClicked');
    setTimeout(() => setAction('idle'), 500);
  }, [setAction]);

  const handleDragStart = useCallback(() => {
    setAction('dragging');
  }, [setAction]);

  const handleDragEnd = useCallback(() => {
    setAction('idle');
  }, [setAction]);

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
