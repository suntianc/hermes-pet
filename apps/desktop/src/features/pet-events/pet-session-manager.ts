import { PetStateEvent } from './pet-event-schema';

type RuntimeAction = string;

interface RuntimeSession {
  id: string;
  agent: string;
  action: RuntimeAction;
  priority: number;
  startedAt: number;
  updatedAt: number;
  expiresAt: number;
}

export interface PetSessionApplyResult {
  accepted: boolean;
  action: RuntimeAction;
  nextExpiryDelay?: number;
}

export interface PetSessionSnapshot {
  ownerAgent: string | null;
  visiblePose: RuntimeAction;
  activeSessionId?: string;
  activeSessionAction?: RuntimeAction;
}

const DEFAULT_AGENT = 'external';
const DEFAULT_SESSION_TTL_MS = 45_000;
const MIN_SESSION_TTL_MS = 1_000;
const MAX_SESSION_TTL_MS = 10 * 60_000;

const ACTION_PRIORITY: Record<string, number> = {
  error: 100,
  waiting_user: 90,
  testing: 80,
  terminal: 70,
  coding: 60,
  reading: 50,
  searching: 45,
  speaking: 40,
  thinking: 30,
  idle: 0,
};

function clampTtl(ttlMs: number | undefined): number {
  if (ttlMs === undefined) return DEFAULT_SESSION_TTL_MS;
  return Math.max(MIN_SESSION_TTL_MS, Math.min(MAX_SESSION_TTL_MS, ttlMs));
}

function actionPriority(action: string, explicitPriority: number | undefined): number {
  return explicitPriority ?? ACTION_PRIORITY[action] ?? 10;
}

function eventAgent(event: PetStateEvent): string {
  return event.source?.agent || DEFAULT_AGENT;
}

function eventSessionId(event: PetStateEvent, agent: string): string {
  return event.source?.sessionId || `${agent}:default`;
}

function isReleaseEvent(event: PetStateEvent): boolean {
  const phase = event.source?.phase;
  return event.action === 'idle' || phase === 'session:end' || phase === 'task:done';
}

export class PetSessionManager {
  private sessions = new Map<string, RuntimeSession>();
  private ownerAgent: string | null = null;

  apply(event: PetStateEvent, now = Date.now()): PetSessionApplyResult {
    this.pruneExpired(now);

    const agent = eventAgent(event);
    if (!this.canAccept(agent)) {
      return {
        accepted: false,
        action: this.resolveVisibleAction(now),
        nextExpiryDelay: this.nextExpiryDelay(now),
      };
    }

    if (isReleaseEvent(event)) {
      this.releaseAgent(agent);
      return {
        accepted: true,
        action: event.action,
        nextExpiryDelay: this.nextExpiryDelay(now),
      };
    }

    if (event.mode === 'context') {
      this.touchOwnerSessions(agent, now, event.ttlMs);
      return {
        accepted: true,
        action: this.resolveVisibleAction(now),
        nextExpiryDelay: this.nextExpiryDelay(now),
      };
    }

    if (event.mode === 'continuous') {
      this.ownerAgent = agent;
      const sessionId = eventSessionId(event, agent);
      this.sessions.set(sessionId, {
        id: sessionId,
        agent,
        action: event.action,
        priority: actionPriority(event.action, event.priority),
        startedAt: this.sessions.get(sessionId)?.startedAt ?? now,
        updatedAt: now,
        expiresAt: now + clampTtl(event.ttlMs),
      });

      return {
        accepted: true,
        action: this.resolveVisibleAction(now),
        nextExpiryDelay: this.nextExpiryDelay(now),
      };
    }

    return {
      accepted: true,
      action: event.action,
      nextExpiryDelay: this.nextExpiryDelay(now),
    };
  }

  refresh(now = Date.now()): PetSessionApplyResult {
    this.pruneExpired(now);
    return {
      accepted: true,
      action: this.resolveVisibleAction(now),
      nextExpiryDelay: this.nextExpiryDelay(now),
    };
  }

  snapshot(now = Date.now()): PetSessionSnapshot {
    this.pruneExpired(now);
    const active = this.resolveBestSession(now);
    return {
      ownerAgent: this.ownerAgent,
      visiblePose: active?.action || 'idle',
      activeSessionId: active?.id,
      activeSessionAction: active?.action,
    };
  }

  private canAccept(agent: string): boolean {
    return this.ownerAgent === null || this.ownerAgent === agent;
  }

  private releaseAgent(agent: string): void {
    for (const [id, session] of this.sessions) {
      if (session.agent === agent) {
        this.sessions.delete(id);
      }
    }
    if (this.ownerAgent === agent) {
      this.ownerAgent = null;
    }
  }

  private touchOwnerSessions(agent: string, now: number, ttlMs: number | undefined): void {
    if (this.ownerAgent !== agent) return;
    for (const session of this.sessions.values()) {
      if (session.agent === agent) {
        session.updatedAt = now;
        session.expiresAt = now + clampTtl(ttlMs);
      }
    }
  }

  private pruneExpired(now: number): void {
    for (const [id, session] of this.sessions) {
      if (session.expiresAt <= now) {
        this.sessions.delete(id);
      }
    }
    if (this.ownerAgent && !Array.from(this.sessions.values()).some((session) => session.agent === this.ownerAgent)) {
      this.ownerAgent = null;
    }
  }

  private resolveVisibleAction(now: number): RuntimeAction {
    return this.resolveBestSession(now)?.action || 'idle';
  }

  private resolveBestSession(now: number): RuntimeSession | null {
    this.pruneExpired(now);
    let best: RuntimeSession | null = null;
    for (const session of this.sessions.values()) {
      if (!best || session.priority > best.priority || (session.priority === best.priority && session.updatedAt > best.updatedAt)) {
        best = session;
      }
    }
    return best;
  }

  private nextExpiryDelay(now: number): number | undefined {
    let next: number | undefined;
    for (const session of this.sessions.values()) {
      const delay = session.expiresAt - now;
      if (delay <= 0) return 0;
      if (next === undefined || delay < next) {
        next = delay;
      }
    }
    return next;
  }
}
