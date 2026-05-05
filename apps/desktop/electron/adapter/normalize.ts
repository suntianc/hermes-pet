import { ADAPTER_VERSION, AgentEvent, AgentEventPhase, AgentTTSOptions } from './protocol';

interface AdapterPayload {
  agent?: string;
  source?: string;
  sessionId?: string;
  session_id?: string;
  phase?: string;
  action?: string;
  type?: string;
  event?: string;
  kind?: string;
  tool?: string;
  tool_name?: string;
  text?: string;
  message?: string;
  error?: string;
  summary?: string;
  level?: string;
  tts?: boolean | AgentTTSOptions;
  metadata?: Record<string, unknown>;
  data?: unknown;
  hook_event_name?: string;
}

const PHASE_ALIASES: Record<string, AgentEventPhase> = {
  idle: 'idle',
  thinking: 'thinking',
  speaking: 'speaking',
  message: 'message',
  tool_start: 'tool:start',
  'tool:start': 'tool:start',
  tool_success: 'tool:success',
  'tool:success': 'tool:success',
  tool_error: 'tool:error',
  'tool:error': 'tool:error',
  task_done: 'task:done',
  'task:done': 'task:done',
  session_start: 'session:start',
  'session:start': 'session:start',
  session_end: 'session:end',
  'session:end': 'session:end',
  pre_tool_call: 'tool:start',
  post_tool_call: 'tool:success',
  post_llm_call: 'speaking',
  pre_llm_call: 'thinking',
  on_session_start: 'session:start',
  on_session_end: 'session:end',
  on_session_finalize: 'session:end',
  agent_start: 'thinking',
  agent_end: 'task:done',
};

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function normalizePhase(value: unknown): AgentEventPhase {
  const key = asString(value)?.trim().toLowerCase();
  if (!key) return 'unknown';
  return PHASE_ALIASES[key] || 'unknown';
}

function normalizeLevel(value: unknown): AgentEvent['level'] {
  if (value === 'debug' || value === 'info' || value === 'warn' || value === 'error') return value;
  return undefined;
}

function normalizeTTS(value: unknown): AgentEvent['tts'] {
  if (typeof value === 'boolean') return value;
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as AgentTTSOptions;
  }
  return undefined;
}

export function normalizeAgentEvent(payload: unknown): AgentEvent {
  const obj = asObject(payload) as AdapterPayload;
  const data = asObject(obj.data);
  const phase = normalizePhase(obj.phase || obj.type || obj.event || obj.hook_event_name);
  const kind = asString(obj.kind || obj.tool || obj.tool_name || data.tool_name || data.tool);
  const text = asString(obj.text || data.text);
  const message = asString(obj.message || data.message);
  const error = asString(obj.error || data.error);
  const summary = asString(obj.summary || data.summary);

  return {
    version: ADAPTER_VERSION,
    agent: asString(obj.agent || obj.source) || (obj.hook_event_name ? 'hermes' : 'external'),
    phase,
    action: asString(obj.action),
    kind,
    sessionId: asString(obj.sessionId || obj.session_id || data.session_id || data.sessionId),
    text,
    message,
    error,
    summary,
    level: normalizeLevel(obj.level || data.level),
    tts: normalizeTTS(obj.tts !== undefined ? obj.tts : data.tts),
    metadata: obj.metadata || data,
    raw: payload,
  };
}
