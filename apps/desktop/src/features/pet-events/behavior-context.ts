import { BehaviorPlan } from './behavior-plan';
import { PetStateEvent } from './pet-event-schema';
import { PetSessionSnapshot } from './pet-session-manager';

const MAX_RECENT_EVENTS = 20;
const MAX_RECENT_ERRORS = 5;

export interface BehaviorContext {
  ownerAgent: string | null;
  visiblePose: string;
  activeSessionId?: string;
  activeSessionAction?: string;
  recentEvents: PetStateEvent[];
  recentErrors: string[];
  lastPlan?: BehaviorPlan;
}

export class BehaviorContextManager {
  private recentEvents: PetStateEvent[] = [];
  private recentErrors: string[] = [];
  private lastPlan: BehaviorPlan | undefined;

  snapshot(session: PetSessionSnapshot): BehaviorContext {
    return {
      ownerAgent: session.ownerAgent,
      visiblePose: session.visiblePose,
      activeSessionId: session.activeSessionId,
      activeSessionAction: session.activeSessionAction,
      recentEvents: [...this.recentEvents],
      recentErrors: [...this.recentErrors],
      lastPlan: this.lastPlan,
    };
  }

  record(event: PetStateEvent, plan: BehaviorPlan): void {
    this.recentEvents = [...this.recentEvents, event].slice(-MAX_RECENT_EVENTS);

    const error = event.message || event.text;
    if (event.source?.phase === 'tool:error' && error) {
      this.recentErrors = [...this.recentErrors, error].slice(-MAX_RECENT_ERRORS);
    }

    this.lastPlan = plan;
  }
}
