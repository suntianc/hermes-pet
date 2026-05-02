import { PetRenderer } from '../pet/PetRenderer';
import { FALLBACK_MODELS } from '../pet/model-registry';
import { ActionRegistryImpl, ActionType } from './action-registry';
import { ActionDefinition } from './action-schema';
import { HermesPetEvent } from '../hermes/hermes-events';

export class ActionDispatcher {
  private renderer: PetRenderer;
  private registry: ActionRegistryImpl;
  private currentAction: string = 'idle';
  private isExecuting: boolean = false;
  private actionQueue: ActionDefinition[] = [];

  constructor(renderer: PetRenderer) {
    this.renderer = renderer;
    this.registry = new ActionRegistryImpl();
  }

  async initialize(): Promise<void> {
    await this.renderer.loadModel(FALLBACK_MODELS[0]);
    this.renderer.idle();
  }

  async dispatch(actionName: ActionType): Promise<void> {
    const action = this.registry.getAction(actionName);
    if (!action) {
      console.warn(`Action not found: ${actionName}`);
      return;
    }

    if (this.isExecuting) {
      this.actionQueue.push(action);
      return;
    }

    await this.executeAction(action);
  }

  private async executeAction(action: ActionDefinition): Promise<void> {
    this.isExecuting = true;
    this.currentAction = action.name;

    if (action.motion) {
      await this.renderer.playMotion(
        action.motion.group,
        action.motion.index
      );
    }

    if (action.expression) {
      await this.renderer.setExpression(action.expression);
    }

    if (action.duration && !action.loop) {
      await this.delay(action.duration);
      this.renderer.idle();
    }

    this.isExecuting = false;

    if (this.actionQueue.length > 0) {
      const nextAction = this.actionQueue.shift()!;
      await this.executeAction(nextAction);
    }
  }

  dispatchFromHermesEvent(event: HermesPetEvent): void {
    const eventToAction: Record<string, ActionType> = {
      idle: 'idle',
      thinking: 'thinking',
      speaking: 'speaking',
      tool_start: 'coding',
      tool_success: 'happy',
      tool_error: 'confused',
      task_done: 'success',
      need_confirmation: 'thinking',
      error: 'error',
    };

    const actionName = eventToAction[event.type] || 'idle';
    this.dispatch(actionName);
  }

  getCurrentAction(): string {
    return this.currentAction;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
