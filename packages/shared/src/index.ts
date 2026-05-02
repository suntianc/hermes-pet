export type PetActionType =
  | 'idle'
  | 'thinking'
  | 'speaking'
  | 'happy'
  | 'angry'
  | 'confused'
  | 'surprised'
  | 'searching'
  | 'reading'
  | 'coding'
  | 'terminal'
  | 'success'
  | 'error'
  | 'sleep'
  | 'wake'
  | 'dragging'
  | 'clicked'
  | 'doubleClicked'
  | 'rightClickMenu';

export interface Position {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface WindowState {
  position: Position;
  size: Size;
  isAlwaysOnTop: boolean;
  isVisible: boolean;
  isPassthrough: boolean;
}

export interface PetConfig {
  modelPath: string;
  defaultAction: PetActionType;
  bubbleDuration: number;
  autoSleepTimeout: number;
  personality: 'quiet' | 'energetic' | 'professional' | 'sarcastic' | 'companion';
}

export const DEFAULT_PET_CONFIG: PetConfig = {
  modelPath: '/assets/models/default',
  defaultAction: 'idle',
  bubbleDuration: 3000,
  autoSleepTimeout: 300000,
  personality: 'companion',
};
