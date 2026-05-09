import { ActionType } from '../actions/action-schema';
import { BehaviorContextManager } from './behavior-context';
import { BehaviorPlan, BehaviorProp, composeRuntimePlan } from './behavior-plan';
import { BehaviorPlanner } from './behavior-planner';
import { PetStateEvent, PetTTSOptions } from './pet-event-schema';
import { PetSessionManager } from './pet-session-manager';

interface PetEventControls {
  currentAction: ActionType;
  sessionManager: PetSessionManager;
  contextManager: BehaviorContextManager;
  planner: BehaviorPlanner;
  clearActionResetTimer: () => void;
  setAction: (action: ActionType) => void;
  setExpression: (expression: string | null) => void;
  setProps: (props: BehaviorProp[]) => void;
  setPerformanceHint?: (plan: BehaviorPlan | null) => void;
  scheduleIdle: (delay: number, afterIdle?: () => void) => void;
  scheduleRuntimeRefresh: (delay?: number) => void;
  handleSpeech: (text: string, ttsOpts?: boolean | PetTTSOptions) => void;
}

export async function applyPetStateEvent(event: PetStateEvent, controls: PetEventControls): Promise<void> {
  const result = controls.sessionManager.apply(event);

  if (!result.accepted) {
    controls.scheduleRuntimeRefresh(result.nextExpiryDelay);
    return;
  }

  const context = controls.contextManager.snapshot(controls.sessionManager.snapshot());
  const plan = await controls.planner.plan(event, context);
  controls.contextManager.record(event, plan);
  controls.setPerformanceHint?.(plan);
  controls.scheduleRuntimeRefresh(result.nextExpiryDelay);

  if (plan.shouldAct === false) {
    return;
  }

  if (event.mode === 'context') {
    // Context updates keep the current pose stable. They may refresh TTL or speech,
    // but they should not restart a Live2D motion.
  } else if (plan.playback === 'hold') {
    controls.clearActionResetTimer();
    if (controls.currentAction !== plan.pose) {
      controls.setAction(plan.pose);
    }
  } else {
    controls.clearActionResetTimer();
    const canInterrupt = plan.interrupt !== false || controls.currentAction === 'idle';
    if (canInterrupt) {
      controls.setAction(plan.pose);
    }
    if (event.resetAfterMs !== undefined) {
      controls.scheduleIdle(event.resetAfterMs, () => {
        const refreshed = controls.sessionManager.refresh();
        const refreshedPlan = composeRuntimePlan(refreshed.action);
        controls.setPerformanceHint?.(refreshedPlan);
        controls.setAction(refreshedPlan.pose);
        if (refreshedPlan.expression !== undefined) {
          controls.setExpression(refreshedPlan.expression);
        }
        controls.setProps(refreshedPlan.props ?? []);
        controls.scheduleRuntimeRefresh(refreshed.nextExpiryDelay);
      });
    }
  }

  if (plan.expression !== undefined) {
    controls.setExpression(plan.expression);
  }
  controls.setProps(plan.props ?? []);

  if (plan.speech?.text) {
    controls.handleSpeech(plan.speech.text, plan.speech.tts);
  }
}
