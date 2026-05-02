export type HermesEvent =
  | 'idle'
  | 'thinking'
  | 'speaking'
  | 'tool_start'
  | 'tool_success'
  | 'tool_error'
  | 'task_done'
  | 'need_confirmation'
  | 'error';

export interface HermesMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
}

export interface HermesConfig {
  apiUrl: string;
  wsUrl: string;
  apiKey?: string;
  model?: string;
  maxTokens?: number;
}

export interface AdapterOptions {
  config: HermesConfig;
  onEvent?: (event: HermesEvent, data?: unknown) => void;
  onMessage?: (message: HermesMessage) => void;
  onError?: (error: Error) => void;
}

export class HermesAdapter {
  private config: HermesConfig;
  private ws: WebSocket | null = null;
  private eventListeners: Set<(event: HermesEvent, data?: unknown) => void> = new Set();

  constructor(options: AdapterOptions) {
    this.config = options.config;
    if (options.onEvent) {
      this.eventListeners.add(options.onEvent);
    }
  }

  connect(): void {
    if (this.ws) {
      this.ws.close();
    }

    this.ws = new WebSocket(this.config.wsUrl);

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.event) {
          this.emit(data.event as HermesEvent, data.data);
        }
      } catch {
        console.warn('Invalid JSON received');
      }
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  send(message: string): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'message', content: message }));
    }
  }

  onEvent(listener: (event: HermesEvent, data?: unknown) => void): () => void {
    this.eventListeners.add(listener);
    return () => {
      this.eventListeners.delete(listener);
    };
  }

  private emit(event: HermesEvent, data?: unknown): void {
    for (const listener of this.eventListeners) {
      try {
        listener(event, data);
      } catch (error) {
        console.error('Event listener error:', error);
      }
    }
  }
}
