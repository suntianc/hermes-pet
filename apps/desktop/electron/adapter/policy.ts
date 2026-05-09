import { ADAPTER_VERSION, AgentEvent, PetStateEvent } from './protocol';

const TOOL_ACTIONS: Record<string, string> = {
  search: 'searching',
  searching: 'searching',
  read: 'reading',
  reading: 'reading',
  code: 'coding',
  coding: 'coding',
  edit: 'coding',
  patch: 'coding',
  terminal: 'terminal',
  shell: 'terminal',
  bash: 'terminal',
  zsh: 'terminal',
  exec: 'terminal',
  command: 'terminal',
  test: 'testing',
  testing: 'testing',
};

const DIRECT_ACTIONS = new Set([
  'idle',
  'thinking',
  'speaking',
  'happy',
  'angry',
  'confused',
  'surprised',
  'searching',
  'reading',
  'coding',
  'terminal',
  'testing',
  'waiting_user',
  'success',
  'error',
  'sleep',
  'wake',
  'dragging',
  'clicked',
  'doubleClicked',
  'rightClickMenu',
]);

const MOMENTARY_RESET: Record<string, number> = {
  happy: 3000,
  success: 2000,
  error: 3000,
  clicked: 300,
  doubleClicked: 500,
};

function speechText(event: AgentEvent): string | undefined {
  return event.text || event.message || event.summary || event.error;
}

function baseEvent(event: AgentEvent, action: string, mode: PetStateEvent['mode']): PetStateEvent {
  return {
    version: ADAPTER_VERSION,
    action,
    mode,
    text: speechText(event),
    message: event.error || event.message,
    ttlMs: event.ttlMs,
    priority: event.priority,
    tts: event.tts,
    source: {
      agent: event.agent,
      phase: event.phase,
      kind: event.kind,
      sessionId: event.sessionId,
    },
    metadata: event.metadata,
  };
}

export function toPetStateEvent(event: AgentEvent): PetStateEvent | null {
  if (event.action && DIRECT_ACTIONS.has(event.action)) {
    const resetAfterMs = MOMENTARY_RESET[event.action];
    const mode: PetStateEvent['mode'] = resetAfterMs === undefined ? 'continuous' : 'momentary';
    return {
      ...baseEvent(event, event.action, mode),
      ...(resetAfterMs === undefined ? {} : { resetAfterMs }),
    };
  }

  switch (event.phase) {
    case 'idle':
      return baseEvent(event, 'idle', 'continuous');
    case 'thinking':
    case 'session:start':
    case 'session:update':
      return baseEvent(event, 'thinking', 'continuous');
    case 'speaking':
    case 'message':
      return baseEvent(event, 'speaking', 'continuous');
    case 'tool:start': {
      const action = event.kind ? TOOL_ACTIONS[event.kind] || 'thinking' : 'thinking';
      return baseEvent(event, action, 'continuous');
    }
    case 'tool:success': {
      return baseEvent(event, 'keep', 'context');
    }
    case 'tool:error': {
      return { ...baseEvent(event, 'error', 'momentary'), resetAfterMs: 3000 };
    }
    case 'task:done':
    case 'session:end': {
      return { ...baseEvent(event, 'happy', 'momentary'), resetAfterMs: 3000 };
    }
    default:
      return null;
  }
}
