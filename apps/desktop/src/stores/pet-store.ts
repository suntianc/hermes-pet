import { useState, useEffect, useCallback } from 'react';
import { ActionType } from '../features/actions/action-schema';

interface PetState {
  currentAction: ActionType;
  bubbleText: string;
  bubbleDuration: number;
  isContextMenuOpen: boolean;
  contextMenuPosition: { x: number; y: number };
  isSleeping: boolean;
  mousePosition: { x: number; y: number };
}

const initialState: PetState = {
  currentAction: 'idle',
  bubbleText: '',
  bubbleDuration: 3000,
  isContextMenuOpen: false,
  contextMenuPosition: { x: 0, y: 0 },
  isSleeping: false,
  mousePosition: { x: 0, y: 0 },
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
    this.notify();
  }

  triggerAction(action: ActionType): void {
    this.state.currentAction = action;
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

  openContextMenu(x: number, y: number): void {
    this.state.isContextMenuOpen = true;
    this.state.contextMenuPosition = { x, y };
    this.notify();
  }

  closeContextMenu(): void {
    this.state.isContextMenuOpen = false;
    this.notify();
  }

  setSleeping(isSleeping: boolean): void {
    this.state.isSleeping = isSleeping;
    if (isSleeping) {
      this.state.currentAction = 'sleep';
    }
    this.notify();
  }

  updateMousePosition(x: number, y: number): void {
    this.state.mousePosition = { x, y };
    this.notify();
  }

  reset(): void {
    this.state = { ...initialState };
    this.notify();
  }
}

const petStoreInstance = new PetStore();

/**
 * React hook that wraps PetStore with reactive state binding.
 * Subscribes to store changes via the class's listener system.
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
    triggerAction: useCallback((action: ActionType) => petStoreInstance.triggerAction(action), []),
    showBubble: useCallback((text: string, duration?: number) => petStoreInstance.showBubble(text, duration), []),
    hideBubble: useCallback(() => petStoreInstance.hideBubble(), []),
    openContextMenu: useCallback((x: number, y: number) => petStoreInstance.openContextMenu(x, y), []),
    closeContextMenu: useCallback(() => petStoreInstance.closeContextMenu(), []),
    setSleeping: useCallback((isSleeping: boolean) => petStoreInstance.setSleeping(isSleeping), []),
    updateMousePosition: useCallback((x: number, y: number) => petStoreInstance.updateMousePosition(x, y), []),
    reset: useCallback(() => petStoreInstance.reset(), []),
  };
}
