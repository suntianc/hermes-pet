export const RIVE_INPUTS = {
  STATE: 'state',
  BLINK_TRIGGER: 'blink',
  BREATHE_TRIGGER: 'breathe',
  MOUTH_OPEN: 'mouth_open',
  LOOK_X: 'look_x',
  LOOK_Y: 'look_y',
} as const;

export type RiveStateValue =
  | 'idle'
  | 'thinking'
  | 'speaking'
  | 'happy'
  | 'error'
  | 'searching'
  | 'coding'
  | 'terminal'
  | 'confused'
  | 'angry';

export const RIVE_STATES: { value: RiveStateValue; label: string }[] = [
  { value: 'idle', label: 'Idle' },
  { value: 'thinking', label: 'Thinking' },
  { value: 'speaking', label: 'Speaking' },
  { value: 'happy', label: 'Happy' },
  { value: 'error', label: 'Error' },
  { value: 'searching', label: 'Searching' },
  { value: 'coding', label: 'Coding' },
  { value: 'terminal', label: 'Terminal' },
  { value: 'confused', label: 'Confused' },
  { value: 'angry', label: 'Angry' },
];
