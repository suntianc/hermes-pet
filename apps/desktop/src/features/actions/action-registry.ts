import { ActionDefinition, ActionRegistry, ActionType } from './action-schema';
import actionsData from './generated-actions.json';

export class ActionRegistryImpl implements ActionRegistry {
  private actions: Map<ActionType, ActionDefinition> = new Map();

  constructor() {
    this.loadDefaultActions();
  }

  private loadDefaultActions(): void {
    for (const action of actionsData.actions) {
      this.registerAction(action);
    }
  }

  getAction(name: ActionType): ActionDefinition | undefined {
    return this.actions.get(name);
  }

  getAllActions(): ActionDefinition[] {
    return Array.from(this.actions.values());
  }

  registerAction(action: ActionDefinition): void {
    this.actions.set(action.name, action);
  }

  hasAction(name: ActionType): boolean {
    return this.actions.has(name);
  }
}
