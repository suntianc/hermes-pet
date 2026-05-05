export interface PetTTSOptions {
  enabled?: boolean;
  voice?: string;
  model?: 'preset' | 'clone' | 'instruct';
  instruct?: string;
}

export interface PetStateEvent {
  version: 'adapter.v1';
  action: string;
  mode: 'continuous' | 'momentary' | 'context';
  resetAfterMs?: number;
  ttlMs?: number;
  priority?: number;
  text?: string;
  message?: string;
  tts?: boolean | PetTTSOptions;
  source?: {
    agent?: string;
    phase?: string;
    kind?: string;
    sessionId?: string;
  };
  metadata?: Record<string, unknown>;
}

export function isPetStateEvent(value: unknown): value is PetStateEvent {
  if (!value || typeof value !== 'object') return false;
  const event = value as Partial<PetStateEvent>;
  return event.version === 'adapter.v1'
    && typeof event.action === 'string'
    && (event.mode === 'continuous' || event.mode === 'momentary' || event.mode === 'context');
}
