export type ActionType =
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

export interface ActionDefinition {
  name: ActionType;
  motion?: {
    group: string;
    index?: number;
  };
  expression?: string;
  duration?: number;
  loop?: boolean;
}

export interface ActionRegistry {
  getAction(name: ActionType): ActionDefinition | undefined;
  getAllActions(): ActionDefinition[];
  registerAction(action: ActionDefinition): void;
  hasAction(name: ActionType): boolean;
}
