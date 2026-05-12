import React, { useEffect, useRef, useState } from 'react';
import { PlayActionOptions } from '../features/pet/PetRenderer';
import { Live2DRenderer } from '../features/pet/Live2DRenderer';
import { ModelConfig } from '../features/pet/model-registry';
import { petWindow, getLastMousePosition } from '../tauri-adapter';

interface PetStageProps {
  currentAction: string;
  actionRevision?: number;
  interactionLocked?: boolean;
  models: ModelConfig[];
  modelIndex?: number;
  isSpeaking?: boolean;
  ttsAmplitude?: number;
  onClick?: () => void;
  onDoubleClick?: () => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
}

const MOMENTARY_ACTIONS = new Set(['happy', 'success', 'error', 'clicked', 'doubleClicked', 'wake']);

type PetDragInsets = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

function playbackForAction(action: string): PlayActionOptions['playback'] {
  return MOMENTARY_ACTIONS.has(action) ? 'momentary' : 'hold';
}

export const PetStage: React.FC<PetStageProps> = ({
  currentAction,
  actionRevision = 0,
  interactionLocked = false,
  models,
  modelIndex = 0,
  isSpeaking = false,
  ttsAmplitude = 0,
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
  const dragInsetsRef = useRef<PetDragInsets | null>(null);
  const [modelLoaded, setModelLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [petPosition, setPetPosition] = useState({ right: 20, bottom: 20 });
  const petPositionRef = useRef(petPosition);

  useEffect(() => {
    petPositionRef.current = petPosition;
  }, [petPosition]);

  const setMousePassthrough = (enabled: boolean) => {
    if (mousePassthroughRef.current === enabled) return;
    mousePassthroughRef.current = enabled;
    document.documentElement.dataset.mousePassthrough = String(enabled);
    petWindow.setIgnoreMouseEvents(enabled).catch(() => {});
  };

  const isPointOnPet = (clientX: number, clientY: number) => {
    const view = rendererRef.current?.view;
    if (!view) return false;
    const rect = view.getBoundingClientRect();
    return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
  };

  const isPointInPetBounds = (clientX: number, clientY: number) => {
    const bounds = canvasContainerRef.current?.getBoundingClientRect();
    if (!bounds) return false;
    return clientX >= bounds.left && clientX <= bounds.right && clientY >= bounds.top && clientY <= bounds.bottom;
  };

  useEffect(() => {
    if (models.length === 0) return;

    setModelLoaded(false);
    setLoadError(null);
    let cancelled = false;

    const initRenderer = async () => {
      console.log('[PetStage] Initializing Live2DRenderer...');
      const renderer = new Live2DRenderer();
      rendererRef.current = renderer;

      const model = models[Math.min(modelIndex, models.length - 1)] ?? models[0];
      console.log(`[PetStage] Loading model from: ${model.path}`);

      await renderer.loadModel(model);
      if (cancelled || rendererRef.current !== renderer) return;

      const container = canvasContainerRef.current;
      if (container && renderer.view) {
        container.appendChild(renderer.view);
        console.log('[PetStage] Live2D canvas appended to container');
      }
      setModelLoaded(true);
    };

    initRenderer().catch((err) => {
      console.error('[PetStage] Failed to initialize renderer:', err);
      if (!cancelled) {
        setLoadError(err instanceof Error ? err.message : String(err));
      }
    });

    return () => {
      cancelled = true;
      if (rendererRef.current) {
        rendererRef.current.destroy();
        rendererRef.current = null;
      }
    };
  }, [models]);

  useEffect(() => {
    if (!rendererRef.current) return;
    console.log(`[PetStage] Action changed to: ${currentAction} #${actionRevision}`);
    rendererRef.current.playAction(currentAction, { playback: playbackForAction(currentAction) });
  }, [actionRevision, currentAction]);

  useEffect(() => {
    if (!rendererRef.current || !modelLoaded) return;
    if (prevModelIndex.current === null) {
      prevModelIndex.current = modelIndex;
      return;
    }
    if (prevModelIndex.current === modelIndex) {
      return;
    }
    prevModelIndex.current = modelIndex;
    console.log(`[PetStage] Switching to model index: ${modelIndex}`);
    const nextModel = models[modelIndex];
    if (!nextModel) return;

    let cancelled = false;
    const switchModel = async () => {
      const renderer = rendererRef.current;
      if (!renderer) return;
      setModelLoaded(false);
      renderer.destroy();

      const newRenderer = new Live2DRenderer();
      rendererRef.current = newRenderer;
      await newRenderer.loadModel(nextModel);
      if (cancelled || rendererRef.current !== newRenderer) return;

      const container = canvasContainerRef.current;
      if (container && newRenderer.view) {
        container.innerHTML = '';
        container.appendChild(newRenderer.view);
      }
      setModelLoaded(true);
    };

    switchModel().catch((err) => {
      console.error('[PetStage] Failed to switch model:', err);
      if (!cancelled) setModelLoaded(true);
    });

    return () => {
      cancelled = true;
    };
  }, [modelIndex, models]);

  useEffect(() => {
    if (!rendererRef.current) return;
    const scale = parseFloat(document.documentElement.dataset.petScale || '1');
    const w = Math.round(520 * scale);
    const h = Math.round(760 * scale);
    rendererRef.current.resize(w, h);
  }, [modelLoaded]);

  useEffect(() => {
    if (!modelLoaded) return;
    const doReset = () => {
      if (document.documentElement.dataset.resetPointer === 'now') {
        rendererRef.current?.resetPointer();
        document.documentElement.dataset.resetPointer = '';
      }
    };
    const observer = new MutationObserver(doReset);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-reset-pointer'] });
    return () => observer.disconnect();
  }, [modelLoaded]);

  useEffect(() => {
    if (!modelLoaded) return;

    if (document.documentElement.dataset.mouseFollow === undefined) {
      document.documentElement.dataset.mouseFollow = 'true';
    }

    let stopped = false;
    let tracking = false;

    const isMouseFollowEnabled = () => document.documentElement.dataset.mouseFollow !== 'false';
    let lastMouseFollowEnabled = isMouseFollowEnabled();

    const handleMouseFollowChange = () => {
      const enabled = isMouseFollowEnabled();
      if (!enabled && lastMouseFollowEnabled) {
        rendererRef.current?.resetPointer();
      }
      lastMouseFollowEnabled = enabled;
    };

    const updateFocus = () => {
      if (!isMouseFollowEnabled()) return;
      if (stopped || tracking || isDraggingRef.current) return;

      tracking = true;
      try {
        const cursor = getLastMousePosition();
        const canvas = rendererRef.current?.view;
        if (!canvas || stopped) return;

        const rect = canvas.getBoundingClientRect();
        const canvasX = ((cursor.x - rect.left) / rect.width) * canvas.width;
        const canvasY = ((cursor.y - rect.top) / rect.height) * canvas.height;

        rendererRef.current?.lookAt(canvasX, canvasY);
      } finally {
        tracking = false;
      }
    };

    const intervalId = window.setInterval(updateFocus, 50);
    const observer = new MutationObserver(handleMouseFollowChange);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-mouse-follow'] });
    updateFocus();

    return () => {
      stopped = true;
      window.clearInterval(intervalId);
      observer.disconnect();
    };
  }, [modelLoaded]);

  useEffect(() => {
    if (!modelLoaded || !rendererRef.current) return;

    if (isSpeaking) {
      rendererRef.current.setSpeaking(true, ttsAmplitude);
    } else {
      rendererRef.current.setSpeaking(false, 0);
    }
  }, [isSpeaking, ttsAmplitude, modelLoaded]);

  useEffect(() => {
    if (!modelLoaded) return;

    let stopped = false;
    let checking = false;

    const updatePassthroughFromCursor = () => {
      if (stopped || checking || isDraggingRef.current) return;

      checking = true;
      try {
        const cursor = getLastMousePosition();
        if (stopped) return;

        const onPet = isPointOnPet(cursor.x, cursor.y);

        if (onPet) {
          setMousePassthrough(false);
        } else if (!interactionLocked) {
          setMousePassthrough(true);
        }
      } finally {
        checking = false;
      }
    };

    const intervalId = window.setInterval(updatePassthroughFromCursor, 50);
    updatePassthroughFromCursor();

    return () => {
      stopped = true;
      window.clearInterval(intervalId);
    };
  }, [interactionLocked, modelLoaded]);

  useEffect(() => {
    if (!modelLoaded) return;
    const container = canvasContainerRef.current;
    if (!container) return;

    let rafId = 0;
    let didMove = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let dragOrigin = { right: 20, bottom: 20 };

    const getVisibleInsets = (): PetDragInsets => {
      return { left: 0, right: 0, top: 0, bottom: 0 };
    };

    const clampPetPosition = (position: { right: number; bottom: number }, insets = dragInsetsRef.current ?? getVisibleInsets()) => {
      const bounds = canvasContainerRef.current?.getBoundingClientRect();
      const petWidth = bounds?.width ?? 80;
      const petHeight = bounds?.height ?? 80;
      const minRight = -insets.right;
      const maxRight = Math.max(minRight, window.innerWidth - petWidth + insets.left);
      const minBottom = -insets.bottom;
      const maxBottom = Math.max(minBottom, window.innerHeight - petHeight + insets.top);
      return {
        right: Math.max(minRight, Math.min(maxRight, position.right)),
        bottom: Math.max(minBottom, Math.min(maxBottom, position.bottom)),
      };
    };

    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
      didMove = false;
      isDraggingRef.current = true;
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      dragOrigin = petPositionRef.current;
      dragInsetsRef.current = getVisibleInsets();
      setMousePassthrough(false);
      onDragStart?.();
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current) return;
      didMove = true;
      if (!rafId) {
        rafId = requestAnimationFrame(() => {
          rafId = 0;
          setPetPosition(clampPetPosition({
            right: dragOrigin.right - (e.clientX - dragStartX),
            bottom: dragOrigin.bottom - (e.clientY - dragStartY),
          }));
        });
      }
    };

    const onMouseUp = () => {
      if (!isDraggingRef.current) return;
      isDraggingRef.current = false;
      dragInsetsRef.current = null;
      if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
      onDragEnd?.();
    };

    const onWindowResize = () => {
      setPetPosition((position) => clampPetPosition(position));
    };

    container.addEventListener('mousedown', onMouseDown, true);
    window.addEventListener('mousemove', onMouseMove, true);
    window.addEventListener('mouseup', onMouseUp, true);
    window.addEventListener('resize', onWindowResize);

    return () => {
      container.removeEventListener('mousedown', onMouseDown, true);
      window.removeEventListener('mousemove', onMouseMove, true);
      window.removeEventListener('mouseup', onMouseUp, true);
      window.removeEventListener('resize', onWindowResize);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [interactionLocked, modelLoaded, onDragStart, onDragEnd]);

  const lastClickTime = useRef(0);
  useEffect(() => {
    const container = canvasContainerRef.current;
    if (!container) return;

    const onClick = (e: MouseEvent) => {
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
        pointerEvents: 'none',
      }}
    >
      <div
        ref={canvasContainerRef}
        className="live2d-container"
        style={{
          position: 'absolute',
          right: petPosition.right,
          bottom: petPosition.bottom,
          pointerEvents: 'auto',
        }}
      />

      {(!modelLoaded || loadError) && (
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
          {loadError ? `Live2D load failed: ${loadError}` : 'Loading Live2D...'}
        </div>
      )}
    </div>
  );
};
