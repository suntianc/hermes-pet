import { PetStateEvent } from './pet-event-schema';

const AGGREGATE_DELAY_MS = 3000;
const MAX_BUFFERED_EVENTS = 6;

function phaseOf(event: PetStateEvent): string {
  return event.source?.phase || '';
}

function isImmediate(event: PetStateEvent): boolean {
  const phase = phaseOf(event);
  return event.action === 'error'
    || event.action === 'waiting_user'
    || phase === 'session:start'
    || phase === 'session:end'
    || phase === 'task:done'
    || phase === 'tool:error';
}

function isBufferable(event: PetStateEvent): boolean {
  const phase = phaseOf(event);
  return event.mode === 'context'
    || phase.startsWith('tool:')
    || phase.startsWith('file:')
    || phase.startsWith('command:')
    || phase.startsWith('agent:');
}

function uniq(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function compactMessages(events: PetStateEvent[]): string[] {
  return uniq(events.map((event) => event.message || event.text || '').filter(Boolean)).slice(-4);
}

function summaryText(events: PetStateEvent[]): string {
  const messages = compactMessages(events);
  if (messages.length === 0) return `观察到 ${events.length} 个后台活动`;
  if (messages.length === 1) return messages[0];
  return messages.join('，');
}

function aggregateMetadata(events: PetStateEvent[]): Record<string, unknown> {
  const first = events[0];
  const last = events[events.length - 1];
  return {
    aggregate: {
      count: events.length,
      windowMs: Math.max(0, Date.now() - Number(first.metadata?.receivedAt || Date.now())),
      phases: uniq(events.map(phaseOf)),
      actions: uniq(events.map((event) => event.action)),
      messages: compactMessages(events),
      firstAt: first.metadata?.receivedAt,
      lastAt: last.metadata?.receivedAt,
    },
  };
}

function withAggregate(event: PetStateEvent, buffered: PetStateEvent[]): PetStateEvent {
  if (buffered.length === 0) return event;
  return {
    ...event,
    metadata: {
      ...(event.metadata || {}),
      ...aggregateMetadata(buffered),
    },
  };
}

function aggregateEvent(events: PetStateEvent[]): PetStateEvent {
  const last = events[events.length - 1];
  return {
    version: 'adapter.v1',
    action: last.action === 'idle' ? 'thinking' : last.action,
    mode: 'continuous',
    text: summaryText(events),
    message: summaryText(events),
    source: {
      agent: last.source?.agent,
      phase: 'activity:summary',
      sessionId: last.source?.sessionId,
    },
    metadata: aggregateMetadata(events),
    ttlMs: 15000,
  };
}

export class PetEventAggregator {
  private buffer: PetStateEvent[] = [];
  private timer: number | null = null;

  constructor(private readonly emit: (event: PetStateEvent) => void) {}

  handle(event: PetStateEvent): void {
    const stampedEvent: PetStateEvent = {
      ...event,
      metadata: {
        ...(event.metadata || {}),
        receivedAt: Date.now(),
      },
    };

    if (isImmediate(stampedEvent)) {
      const buffered = this.drainBuffer();
      this.emit(withAggregate(stampedEvent, buffered));
      return;
    }

    if (!isBufferable(stampedEvent)) {
      this.emit(stampedEvent);
      return;
    }

    this.buffer.push(stampedEvent);
    if (this.buffer.length >= MAX_BUFFERED_EVENTS) {
      this.flush();
      return;
    }
    this.scheduleFlush();
  }

  dispose(): void {
    if (this.timer !== null) {
      window.clearTimeout(this.timer);
      this.timer = null;
    }
    this.buffer = [];
  }

  private scheduleFlush(): void {
    if (this.timer !== null) return;
    this.timer = window.setTimeout(() => {
      this.timer = null;
      this.flush();
    }, AGGREGATE_DELAY_MS);
  }

  private flush(): void {
    const events = this.drainBuffer();
    if (events.length > 0) {
      this.emit(aggregateEvent(events));
    }
  }

  private drainBuffer(): PetStateEvent[] {
    if (this.timer !== null) {
      window.clearTimeout(this.timer);
      this.timer = null;
    }
    const events = this.buffer;
    this.buffer = [];
    return events;
  }
}
