export type PetActionStep =
  | {
      type: 'motion';
      group: string;
      index?: number;
      duration?: number;
      loop?: boolean;
    }
  | {
      type: 'expression';
      name: string;
      duration?: number;
    }
  | {
      type: 'bubble';
      text: string;
      duration?: number;
    }
  | {
      type: 'speak';
      text: string;
    }
  | {
      type: 'moveTo';
      x: number;
      y: number;
      duration: number;
    }
  | {
      type: 'lookAtCursor';
      duration?: number;
    }
  | {
      type: 'wait';
      duration: number;
    }
  | {
      type: 'sequence';
      steps: PetActionStep[];
    }
  | {
      type: 'parallel';
      steps: PetActionStep[];
    };

export interface PetAction {
  name: string;
  description?: string;
  steps: PetActionStep[];
}

export interface ActionUsage {
  name: string;
  usageCount: number;
  positiveFeedback: number;
  negativeFeedback: number;
  preferredFor: string[];
  lastUsed: number;
  successRate: number;
}

export interface ActionProposal {
  name: string;
  description: string;
  reason: string;
  steps: PetActionStep[];
  proposedBy: 'hermes' | 'user';
  status: 'pending' | 'approved' | 'rejected';
}

export function isValidActionStep(step: unknown): step is PetActionStep {
  if (!step || typeof step !== 'object') return false;
  const s = step as Record<string, unknown>;
  if (!('type' in s)) return false;

  const validTypes = [
    'motion',
    'expression',
    'bubble',
    'speak',
    'moveTo',
    'lookAtCursor',
    'wait',
    'sequence',
    'parallel',
  ];

  return validTypes.includes(s.type as string);
}
