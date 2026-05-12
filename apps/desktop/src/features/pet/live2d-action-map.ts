export interface ActionMapEntry {
  groups: string[];
  playback: 'hold' | 'restart' | 'momentary';
}

export const MOMENTARY_ACTIONS = new Set(['happy', 'error', 'clicked', 'doubleClicked', 'wake']);

const ACTION_MOTION_MAP: Record<string, ActionMapEntry> = {
  idle: { groups: ['Idle', 'idle'], playback: 'hold' },
  thinking: { groups: ['Thinking', 'thinking'], playback: 'hold' },
  speaking: { groups: ['Speaking', 'speaking'], playback: 'hold' },
  happy: { groups: ['Happy', 'happy'], playback: 'momentary' },
  error: { groups: ['Error', 'error'], playback: 'momentary' },
  searching: { groups: ['Searching', 'searching'], playback: 'hold' },
  coding: { groups: ['Coding', 'coding'], playback: 'hold' },
  terminal: { groups: ['Terminal', 'terminal'], playback: 'hold' },
  confused: { groups: ['Confused', 'confused'], playback: 'momentary' },
  angry: { groups: ['Angry', 'angry'], playback: 'momentary' },
  wake: { groups: ['Wake', 'wake', 'Idle'], playback: 'momentary' },
  sleep: { groups: ['Sleep', 'sleep', 'Idle'], playback: 'hold' },
  clicked: { groups: ['Clicked', 'clicked', 'Tap', 'Idle'], playback: 'momentary' },
  doubleClicked: { groups: ['DoubleClicked', 'double_clicked', 'Tap', 'Idle'], playback: 'momentary' },
};

export function resolveAction(actionName: string): ActionMapEntry {
  const entry = ACTION_MOTION_MAP[actionName];
  if (entry) return entry;
  return { groups: ['Idle', 'idle'], playback: 'hold' };
}
