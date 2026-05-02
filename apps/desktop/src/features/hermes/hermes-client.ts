import { HermesPetEvent } from './hermes-events';

type EventCallback = (event: HermesPetEvent) => void;

export interface RunEvent {
  event: string;
  run_id?: string;
  delta?: string;
  text?: string;
  tool?: string;
  name?: string;
  preview?: string;
  timestamp?: number;
  error?: string;
  output?: string | null;
  session_id?: string;
}

export class HermesClient {
  private eventSource: EventSource | null = null;
  private abortController: AbortController | null = null;
  private gatewayUrl: string = '';
  private apiKey: string = '';
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;
  private eventListeners: Set<EventCallback> = new Set();
  private isConnected: boolean = false;
  private currentRunId: string | null = null;

  onEvent(callback: EventCallback): () => void {
    this.eventListeners.add(callback);
    return () => {
      this.eventListeners.delete(callback);
    };
  }

  connect(gatewayUrl: string, apiKey: string = ''): void {
    this.gatewayUrl = gatewayUrl.replace(/\/$/, '');
    this.apiKey = apiKey;
    this.isConnected = true;
    console.log(`Hermes Gateway configured: ${this.gatewayUrl}`);
  }

  async sendMessage(input: string, sessionId?: string): Promise<void> {
    if (!this.gatewayUrl) {
      console.warn('Gateway not configured');
      return;
    }

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (this.apiKey) {
        headers['Authorization'] = `Bearer ${this.apiKey}`;
      }

      const body: Record<string, unknown> = {
        input,
      };

      if (sessionId) {
        body.session_id = sessionId;
      }

      const response = await fetch(`${this.gatewayUrl}/v1/runs`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(120000),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new Error(`Gateway error ${response.status}: ${errorText}`);
      }

      const runData = await response.json() as { run_id: string; status: string };
      this.currentRunId = runData.run_id;

      this.notifyListeners({ type: 'idle' });

      this.startEventSource(runData.run_id);

    } catch (error) {
      console.error('Failed to send message:', error);
      this.notifyListeners({
        type: 'error',
        message: error instanceof Error ? error.message : 'Failed to send message',
      });
    }
  }

  private startEventSource(runId: string): void {
    this.closeEventSource();

    const eventsUrl = new URL(`${this.gatewayUrl}/v1/runs/${runId}/events`);

    const eventSourceInit: any = {};

    if (this.apiKey) {
      eventSourceInit.fetch = (url: string, init: any = {}) => {
        return fetch(url, {
          ...init,
          headers: {
            ...(init.headers || {}),
            'Authorization': `Bearer ${this.apiKey}`,
          },
        });
      };
    }

    this.eventSource = new EventSource(eventsUrl.toString(), eventSourceInit);

    this.eventSource.onmessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data) as RunEvent;
        this.handleGatewayEvent(data);
      } catch (error) {
        console.warn('Failed to parse SSE event:', error);
      }
    };

    this.eventSource.onerror = (error) => {
      console.error('EventSource error:', error);
      this.isConnected = false;

      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectAttempts++;
        console.log(`Reconnecting... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
        setTimeout(() => {
          if (this.currentRunId) {
            this.startEventSource(this.currentRunId);
          }
        }, 3000);
      } else {
        this.notifyListeners({
          type: 'error',
          message: 'Connection lost',
        });
      }
    };

    this.eventSource.onopen = () => {
      console.log('EventSource connected');
      this.isConnected = true;
      this.reconnectAttempts = 0;
    };
  }

  private handleGatewayEvent(data: RunEvent): void {
    const { event } = data;

    switch (event) {
      case 'run.started':
        this.notifyListeners({ type: 'idle' });
        break;

      case 'message.delta':
        this.notifyListeners({
          type: 'speaking',
          text: data.delta || '',
        });
        break;

      case 'reasoning.delta':
      case 'thinking.delta':
        this.notifyListeners({ type: 'thinking' });
        break;

      case 'reasoning.available':
        this.notifyListeners({ type: 'idle' });
        break;

      case 'tool.started': {
        const toolName = (data.tool || data.name || '').toLowerCase();
        let toolType: 'searching' | 'reading' | 'coding' | 'terminal' = 'coding';

        if (toolName.includes('search') || toolName.includes('web')) {
          toolType = 'searching';
        } else if (toolName.includes('read') || toolName.includes('file')) {
          toolType = 'reading';
        } else if (toolName.includes('terminal') || toolName.includes('bash') ||
                   toolName.includes('shell') || toolName.includes('command')) {
          toolType = 'terminal';
        }

        this.notifyListeners({ type: 'tool_start', tool: toolType });
        break;
      }

      case 'tool.completed': {
        const hasError = (data as any).error === true;
        this.notifyListeners({
          type: hasError ? 'tool_error' : 'tool_success',
          tool: data.tool || '',
          error: hasError ? String((data as any).error) : undefined,
        });
        break;
      }

      case 'run.completed':
        this.notifyListeners({ type: 'task_done' });
        this.closeEventSource();
        break;

      case 'run.failed':
        this.notifyListeners({
          type: 'error',
          message: data.error || 'Run failed',
        });
        this.closeEventSource();
        break;

      case 'compression.started':
        this.notifyListeners({ type: 'thinking' });
        break;

      case 'compression.completed':
        this.notifyListeners({ type: 'idle' });
        break;
    }
  }

  private closeEventSource(): void {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  private notifyListeners(event: HermesPetEvent): void {
    for (const listener of this.eventListeners) {
      try {
        listener(event);
      } catch (error) {
        console.error('Event listener error:', error);
      }
    }
  }

  disconnect(): void {
    this.closeEventSource();
    this.isConnected = false;
    this.currentRunId = null;
  }

  getConnectionStatus(): boolean {
    return this.isConnected;
  }
}
