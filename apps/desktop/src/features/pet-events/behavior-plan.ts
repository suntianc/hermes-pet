import { PetStateEvent, PetTTSOptions } from './pet-event-schema';

export type BehaviorPose =
  | 'idle'
  | 'thinking'
  | 'speaking'
  | 'searching'
  | 'reading'
  | 'coding'
  | 'terminal'
  | 'testing'
  | 'waiting_user'
  | 'success'
  | 'error'
  | 'happy'
  | string;

export type BehaviorExpression =
  | 'neutral'
  | 'focused'
  | 'happy'
  | 'confused'
  | 'worried'
  | 'surprised'
  | 'angry'
  | string;

export interface BehaviorSpeech {
  text: string;
  tts?: boolean | PetTTSOptions;
}

export interface BehaviorProp {
  name: string;
  enabled: boolean;
}

export interface BehaviorPlan {
  pose: BehaviorPose;
  playback: 'hold' | 'momentary';
  expression?: BehaviorExpression;
  speech?: BehaviorSpeech;
  props?: BehaviorProp[];
  durationMs?: number;
}

function speechText(event: PetStateEvent): string | undefined {
  return event.text || event.message;
}

function expressionForEvent(event: PetStateEvent, pose: string): BehaviorExpression | undefined {
  const phase = event.source?.phase;
  const kind = event.source?.kind?.toLowerCase();

  if (pose === 'error' || phase === 'tool:error') return 'worried';
  if (pose === 'success' || pose === 'happy' || phase === 'task:done') return 'happy';
  if (pose === 'terminal' || kind === 'bash' || kind === 'shell' || kind === 'zsh') return 'focused';
  if (pose === 'reading' || pose === 'coding' || pose === 'testing') return 'focused';
  if (pose === 'waiting_user') return 'confused';
  if (pose === 'speaking') return 'neutral';
  return undefined;
}

function propsForEvent(event: PetStateEvent, pose: string): BehaviorProp[] | undefined {
  const phase = event.source?.phase;
  if (pose === 'speaking' || phase === 'message') {
    return [{ name: 'microphone', enabled: true }];
  }
  return undefined;
}

export function composeBehaviorPlan(event: PetStateEvent, visiblePose: string): BehaviorPlan {
  const text = speechText(event);
  return {
    pose: visiblePose,
    playback: event.mode === 'momentary' ? 'momentary' : 'hold',
    expression: expressionForEvent(event, visiblePose),
    props: propsForEvent(event, visiblePose),
    durationMs: event.resetAfterMs,
    speech: text ? { text, tts: event.tts } : undefined,
  };
}

export function composeRuntimePlan(visiblePose: string): BehaviorPlan {
  return {
    pose: visiblePose,
    playback: 'hold',
    expression: visiblePose === 'idle' ? 'neutral' : undefined,
  };
}
