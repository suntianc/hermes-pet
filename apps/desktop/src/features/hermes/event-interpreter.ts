import { HermesPetEvent } from './hermes-events';

export class EventInterpreter {
  private lastEvent: HermesPetEvent | null = null;
  private eventHistory: HermesPetEvent[] = [];
  private maxHistorySize: number = 50;

  interpret(event: HermesPetEvent): HermesPetEvent {
    this.recordEvent(event);

    if (event.type === 'speaking' && this.lastEvent?.type === 'thinking') {
      return event;
    }

    if (event.type === 'tool_error') {
      return this.interpretToolError(event);
    }

    if (event.type === 'need_confirmation') {
      return { type: 'thinking' };
    }

    return event;
  }

  private interpretToolError(event: Extract<HermesPetEvent, { type: 'tool_error' }>): HermesPetEvent {
    return event;
  }

  private recordEvent(event: HermesPetEvent): void {
    this.eventHistory.push(event);
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory.shift();
    }
    this.lastEvent = event;
  }

  getLastEvent(): HermesPetEvent | null {
    return this.lastEvent;
  }

  getEventHistory(): HermesPetEvent[] {
    return [...this.eventHistory];
  }

  clearHistory(): void {
    this.eventHistory = [];
    this.lastEvent = null;
  }
}
