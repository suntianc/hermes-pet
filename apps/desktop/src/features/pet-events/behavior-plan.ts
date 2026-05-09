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
  shouldAct?: boolean;
  expression?: BehaviorExpression;
  speech?: BehaviorSpeech;
  props?: BehaviorProp[];
  intensity?: number;
  interrupt?: boolean;
  durationMs?: number;
  reason?: string;
}

function speechText(event: PetStateEvent): string | undefined {
  return event.text || event.message;
}

function expressionForEvent(event: PetStateEvent, pose: string): BehaviorExpression | undefined {
  const phase = event.source?.phase;
  const kind = event.source?.kind?.toLowerCase();

  if (pose === 'error' || phase === 'tool:error') return 'worried';
  if (pose === 'success' || pose === 'happy' || phase === 'task:done' || phase === 'session:end') return 'happy';
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
  const pose = event.mode === 'momentary' ? event.action : visiblePose;
  return {
    pose,
    playback: event.mode === 'momentary' ? 'momentary' : 'hold',
    shouldAct: true,
    expression: expressionForEvent(event, pose),
    props: propsForEvent(event, pose),
    intensity: event.mode === 'momentary' ? 0.75 : 0.55,
    interrupt: event.mode === 'momentary',
    durationMs: event.resetAfterMs,
    speech: text ? { text, tts: event.tts } : undefined,
  };
}

export function composeRuntimePlan(visiblePose: string): BehaviorPlan {
  return {
    pose: visiblePose,
    playback: 'hold',
    shouldAct: true,
    intensity: 0.45,
    interrupt: false,
    expression: visiblePose === 'idle' ? 'neutral' : undefined,
  };
}
