export const ADAPTER_VERSION = 'adapter.v1';

export type AgentEventPhase =
  | 'idle'
  | 'thinking'
  | 'speaking'
  | 'tool:start'
  | 'tool:success'
  | 'tool:error'
  | 'task:done'
  | 'session:start'
  | 'session:end'
  | 'message'
  | 'unknown';

export interface AgentTTSOptions {
  enabled?: boolean;
  voice?: string;
  model?: 'preset' | 'clone' | 'instruct';
  instruct?: string;
}

export interface AgentEvent {
  version: typeof ADAPTER_VERSION;
  agent: string;
  phase: AgentEventPhase;
  action?: string;
  kind?: string;
  sessionId?: string;
  text?: string;
  message?: string;
  error?: string;
  summary?: string;
  level?: 'debug' | 'info' | 'warn' | 'error';
  tts?: boolean | AgentTTSOptions;
  metadata?: Record<string, unknown>;
  raw?: unknown;
}

export interface PetStateEvent {
  version: typeof ADAPTER_VERSION;
  action: string;
  mode: 'continuous' | 'momentary';
  resetAfterMs?: number;
  text?: string;
  message?: string;
  tts?: boolean | AgentTTSOptions;
  source: {
    agent: string;
    phase: AgentEventPhase;
    kind?: string;
    sessionId?: string;
  };
  metadata?: Record<string, unknown>;
}

export interface AdapterCapabilities {
  ok: true;
  version: typeof ADAPTER_VERSION;
  service: 'vivipet-adapter';
  capabilities: {
    states: string[];
    phases: AgentEventPhase[];
    speech: boolean;
    tts: boolean;
    ttsControl: {
      field: 'tts';
      default: false;
      fallbackToBubble: true;
      acceptedValues: Array<'boolean' | 'options.enabled'>;
    };
  };
}
