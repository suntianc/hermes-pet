export type HermesPetEvent =
  | { type: 'idle' }
  | { type: 'thinking' }
  | { type: 'speaking'; text: string }
  | { type: 'tool_start'; tool: string }
  | { type: 'tool_success'; tool: string }
  | { type: 'tool_error'; tool: string; error?: string }
  | { type: 'task_done'; summary?: string }
  | { type: 'need_confirmation'; message: string }
  | { type: 'web_search'; query: string }
  | { type: 'file_read'; path: string }
  | { type: 'terminal'; command: string }
  | { type: 'error'; message: string };

export interface HermesEventPayload {
  event: HermesPetEvent;
  timestamp: number;
}

export const HERMES_EVENT_TYPES = [
  'idle',
  'thinking',
  'speaking',
  'tool_start',
  'tool_success',
  'tool_error',
  'task_done',
  'need_confirmation',
  'web_search',
  'file_read',
  'terminal',
  'error',
] as const;
