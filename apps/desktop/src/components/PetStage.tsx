import React, { useEffect, useRef, useState } from 'react';
import { Live2DRenderer } from '../features/pet/Live2DRenderer';
import { getModelWindowSize, ModelConfig } from '../features/pet/model-registry';

interface PetStageProps {
  currentAction: string;
  actionRevision?: number;
  models: ModelConfig[];
  modelIndex?: number;
  onClick?: () => void;
  onDoubleClick?: () => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
}

export const PetStage: React.FC<PetStageProps> = ({
  currentAction,
  actionRevision = 0,
  models,
  modelIndex = 0,
  onClick: handlePetClick,
  onDoubleClick: handlePetDoubleClick,
  onDragStart,
  onDragEnd,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<Live2DRenderer | null>(null);
  const mousePassthroughRef = useRef<boolean | null>(null);
  const isDraggingRef = useRef(false);
  const prevModelIndex = useRef<number | null>(null);
  const [modelLoaded, setModelLoaded] = useState(false);

  const setMousePassthrough = (enabled: boolean) => {
    if (mousePassthroughRef.current === enabled) return;
    mousePassthroughRef.current = enabled;
    window.electronAPI?.petWindow.setIgnoreMouseEvents(enabled, { forward: true });
  };

  const isPointOnPet = (clientX: number, clientY: number) => {
    return rendererRef.current?.hitTestClientPoint(clientX, clientY) ?? false;
  };

  useEffect(() => {
    if (models.length === 0) return;

    setModelLoaded(false);
    prevModelIndex.current = null;
    let disposed = false;

    const initRenderer = async () => {
      console.log('[PetStage] Initializing Live2DRenderer...');
      const renderer = new Live2DRenderer();
      rendererRef.current = renderer;

      const model = models[Math.min(modelIndex, models.length - 1)] ?? models[0];
      console.log(`[PetStage] Loading model from: ${model.path}`);

      await renderer.loadModel(model);
      if (disposed || rendererRef.current !== renderer) return;

      const canvas = renderer.view;
      if (canvas && canvasContainerRef.current) {
        while (canvasContainerRef.current.firstChild) {
          canvasContainerRef.current.removeChild(canvasContainerRef.current.firstChild);
        }
        canvas.style.display = 'block';
        canvasContainerRef.current.appendChild(canvas);
        console.log('[PetStage] Canvas appended to container');
        setModelLoaded(true);
      }
    };

    initRenderer();

    return () => {
      disposed = true;
      if (rendererRef.current) {
        rendererRef.current.destroy();
        rendererRef.current = null;
      }
    };
  }, [models]);

  useEffect(() => {
    const model = models[modelIndex];
    if (!model) return;

    const { width, height } = getModelWindowSize(model);
    window.electronAPI?.petWindow.setSize(width, height);
  }, [modelIndex, models]);

  useEffect(() => {
    if (!modelLoaded || !rendererRef.current) return;
    console.log(`[PetStage] Action changed to: ${currentAction} #${actionRevision}`);
    rendererRef.current.playAction(currentAction);
  }, [actionRevision, currentAction, modelLoaded]);

  useEffect(() => {
    if (!rendererRef.current || !modelLoaded) return;
    if (prevModelIndex.current === null) {
      prevModelIndex.current = modelIndex;
      return;
    }
    prevModelIndex.current = modelIndex;
    console.log(`[PetStage] Switching to model index: ${modelIndex}`);
    const nextModel = models[modelIndex];
    if (nextModel) {
      rendererRef.current.switchModel(nextModel, modelIndex);
    }
  }, [modelIndex, modelLoaded, models]);

  // ── Cursor tracking (eye follow) ──
  useEffect(() => {
    if (!modelLoaded) return;

    let stopped = false;
    let tracking = false;

    const updateFocus = async () => {
      if (stopped || tracking || isDraggingRef.current) return;

      tracking = true;
      try {
        const [cursor, windowPosition] = await Promise.all([
          window.electronAPI?.petWindow.getCursorScreenPoint(),
          window.electronAPI?.petWindow.getPosition(),
        ]);
        const canvas = rendererRef.current?.view;
        if (!cursor || !windowPosition || !canvas || stopped) return;

        const rect = canvas.getBoundingClientRect();
        const clientX = cursor.x - windowPosition.x;
        const clientY = cursor.y - windowPosition.y;
        const canvasX = ((clientX - rect.left) / rect.width) * canvas.width;
        const canvasY = ((clientY - rect.top) / rect.height) * canvas.height;

        rendererRef.current?.lookAt(canvasX, canvasY);
      } finally {
        tracking = false;
      }
    };

    const intervalId = window.setInterval(updateFocus, 50);
    updateFocus();

    return () => {
      stopped = true;
      window.clearInterval(intervalId);
    };
  }, [modelLoaded]);

  // ── Mouse passthrough & drag ──
  useEffect(() => {
    if (!modelLoaded) return;
    const container = containerRef.current;
    if (!container) return;

    let rafId = 0;
    let didMove = false;

    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      if (!isPointOnPet(e.clientX, e.clientY)) return;

      e.preventDefault();
      didMove = false;
      isDraggingRef.current = true;
      window.electronAPI?.petWindow.beginDrag();
      onDragStart?.();
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current) {
        setMousePassthrough(!isPointOnPet(e.clientX, e.clientY));
      }

      if (!isDraggingRef.current) return;
      didMove = true;
      if (!rafId) {
        rafId = requestAnimationFrame(() => {
          rafId = 0;
          window.electronAPI?.petWindow.dragToCursor();
        });
      }
    };

    const onMouseUp = () => {
      if (!isDraggingRef.current) return;
      isDraggingRef.current = false;
      if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
      window.electronAPI?.petWindow.endDrag();
      onDragEnd?.();
      if (!didMove) {
        setMousePassthrough(true);
      }
    };

    container.addEventListener('mousedown', onMouseDown, true);
    container.addEventListener('mousemove', onMouseMove, true);
    window.addEventListener('mouseup', onMouseUp, true);

    return () => {
      container.removeEventListener('mousedown', onMouseDown, true);
      container.removeEventListener('mousemove', onMouseMove, true);
      window.removeEventListener('mouseup', onMouseUp, true);
      if (rafId) cancelAnimationFrame(rafId);
      window.electronAPI?.petWindow.endDrag();
    };
  }, [modelLoaded, onDragStart, onDragEnd]);

  // ── Click ──
  const lastClickTime = useRef(0);
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onClick = (e: MouseEvent) => {
      if (!isPointOnPet(e.clientX, e.clientY)) return;
      const now = Date.now();
      if (now - lastClickTime.current < 300) {
        handlePetDoubleClick?.();
        lastClickTime.current = 0;
      } else {
        lastClickTime.current = now;
        handlePetClick?.();
      }
    };

    container.addEventListener('click', onClick, true);

    return () => {
      container.removeEventListener('click', onClick, true);
    };
  }, [handlePetClick, handlePetDoubleClick]);

  return (
    <div
      ref={containerRef}
      className="pet-stage"
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
      }}
    >
      <div
        ref={canvasContainerRef}
        className="live2d-container"
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      />

      {!modelLoaded && (
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            color: '#888',
            fontSize: 14,
            fontFamily: 'system-ui, sans-serif',
          }}
        >
          Loading Live2D...
        </div>
      )}
    </div>
  );
};
