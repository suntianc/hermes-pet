import { HermesPetEvent } from '../features/hermes/hermes-events';

type HermesStatus = HermesPetEvent['type'] | 'disconnected' | 'connecting';

interface HermesState {
  hermesStatus: HermesStatus;
  lastMessage: string;
  isConnected: boolean;
  connectionUrl: string;
}

const initialState: HermesState = {
  hermesStatus: 'disconnected',
  lastMessage: '',
  isConnected: false,
  connectionUrl: 'ws://localhost:8080',
};

class HermesStore {
  private state: HermesState = { ...initialState };
  private listeners: Set<(state: HermesState) => void> = new Set();

  getState(): HermesState {
    return { ...this.state };
  }

  subscribe(listener: (state: HermesState) => void): () => void {
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

  setStatus(status: HermesStatus): void {
    this.state.hermesStatus = status;
    this.notify();
  }

  setConnected(isConnected: boolean): void {
    this.state.isConnected = isConnected;
    if (isConnected) {
      this.state.hermesStatus = 'idle';
    } else {
      this.state.hermesStatus = 'disconnected';
    }
    this.notify();
  }

  setLastMessage(message: string): void {
    this.state.lastMessage = message;
    this.notify();
  }

  setConnectionUrl(url: string): void {
    this.state.connectionUrl = url;
    this.notify();
  }

  reset(): void {
    this.state = { ...initialState };
    this.notify();
  }
}

export const useHermesStore = new HermesStore();
