import { useState, useEffect, useCallback } from 'react';
import { ActionType } from '../features/actions/action-schema';

interface PetState {
  currentAction: ActionType;
  actionRevision: number;
  bubbleText: string;
  bubbleDuration: number;
}

const initialState: PetState = {
  currentAction: 'idle',
  actionRevision: 0,
  bubbleText: '',
  bubbleDuration: 3000,
};

class PetStore {
  private state: PetState = { ...initialState };
  private listeners: Set<(state: PetState) => void> = new Set();

  getState(): PetState {
    return { ...this.state };
  }

  subscribe(listener: (state: PetState) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener(this.getState());
    }
  }

  setAction(action: ActionType): void {
    this.state.currentAction = action;
    this.state.actionRevision += 1;
    this.notify();
  }

  showBubble(text: string, duration?: number): void {
    this.state.bubbleText = text;
    if (duration !== undefined) {
      this.state.bubbleDuration = duration;
    }
    this.notify();
  }

  hideBubble(): void {
    this.state.bubbleText = '';
    this.notify();
  }
}

const petStoreInstance = new PetStore();

/**
 * React hook that wraps PetStore with reactive state binding.
 */
export function usePetStore() {
  const [state, setState] = useState<PetState>(() => petStoreInstance.getState());

  useEffect(() => {
    return petStoreInstance.subscribe((newState) => {
      setState(newState);
    });
  }, []);

  return {
    ...state,
    setAction: useCallback((action: ActionType) => petStoreInstance.setAction(action), []),
    showBubble: useCallback((text: string, duration?: number) => petStoreInstance.showBubble(text, duration), []),
    hideBubble: useCallback(() => petStoreInstance.hideBubble(), []),
  };
}
