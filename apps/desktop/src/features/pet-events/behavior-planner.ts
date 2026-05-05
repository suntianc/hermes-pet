import { BehaviorContext } from './behavior-context';
import { BehaviorPlan, composeBehaviorPlan } from './behavior-plan';
import { PetStateEvent } from './pet-event-schema';

export interface BehaviorPlanner {
  plan(event: PetStateEvent, context: BehaviorContext): Promise<BehaviorPlan>;
}

export type PlannerTrace =
  | { source: 'rule' }
  | { source: 'ai'; elapsedMs: number; plan: BehaviorPlan }
  | { source: 'fallback'; elapsedMs: number; error: string };

type TraceHandler = (trace: PlannerTrace) => void;

export class RuleBasedBehaviorPlanner implements BehaviorPlanner {
  constructor(private readonly onTrace?: TraceHandler) {}

  async plan(event: PetStateEvent, context: BehaviorContext): Promise<BehaviorPlan> {
    this.onTrace?.({ source: 'rule' });
    return composeBehaviorPlan(event, context.visiblePose);
  }
}

function isBehaviorPlan(value: unknown): value is BehaviorPlan {
  if (!value || typeof value !== 'object') return false;
  const plan = value as Partial<BehaviorPlan>;
  return typeof plan.pose === 'string'
    && (plan.playback === 'hold' || plan.playback === 'momentary');
}

export class AIBehaviorPlanner implements BehaviorPlanner {
  constructor(
    private readonly fallback = new RuleBasedBehaviorPlanner(),
    private readonly onTrace?: TraceHandler,
  ) {}

  async plan(event: PetStateEvent, context: BehaviorContext): Promise<BehaviorPlan> {
    const rulePlan = await this.fallback.plan(event, context);
    const api = (window as any).electronAPI?.petAI;
    if (!api?.plan) return rulePlan;

    const startedAt = performance.now();
    const result = await api.plan({ event, context, rulePlan });
    if (result?.ok && isBehaviorPlan(result.plan)) {
      this.onTrace?.({ source: 'ai', elapsedMs: Math.round(performance.now() - startedAt), plan: result.plan });
      return result.plan;
    }
    this.onTrace?.({
      source: 'fallback',
      elapsedMs: Math.round(performance.now() - startedAt),
      error: result?.error || 'Invalid AI planner result',
    });
    return rulePlan;
  }
}

export class HybridBehaviorPlanner extends AIBehaviorPlanner {}
