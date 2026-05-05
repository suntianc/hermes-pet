import OpenAI from 'openai';
import log from 'electron-log';
import { AIPlannerConfig, getDefaultAIPlannerConfig, loadAIPlannerConfig, saveAIPlannerConfig } from './ai-planner-config';

type JsonRecord = Record<string, unknown>;

export interface AIPlanRequest {
  event: JsonRecord;
  context: JsonRecord;
  rulePlan: JsonRecord;
}

export interface AIPlanResult {
  ok: boolean;
  plan?: JsonRecord;
  error?: string;
}

const ALLOWED_POSES = ['idle', 'thinking', 'speaking', 'searching', 'reading', 'coding', 'terminal', 'testing', 'waiting_user', 'success', 'error', 'happy'];
const ALLOWED_EXPRESSIONS = ['neutral', 'focused', 'happy', 'confused', 'worried', 'surprised', 'angry'];

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`AI planner timed out after ${timeoutMs}ms`)), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

function makeClient(config: AIPlannerConfig): OpenAI {
  return new OpenAI({
    apiKey: config.apiKey || 'EMPTY',
    baseURL: normalizeBaseUrl(config.baseUrl),
  });
}

function normalizeBaseUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  return /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
}

function extractJson(text: string): JsonRecord {
  try {
    return JSON.parse(text) as JsonRecord;
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('AI response did not contain JSON');
    return JSON.parse(match[0]) as JsonRecord;
  }
}

function sanitizePlan(raw: JsonRecord, fallback: JsonRecord): JsonRecord {
  const pose = typeof raw.pose === 'string' && ALLOWED_POSES.includes(raw.pose)
    ? raw.pose
    : fallback.pose;
  const playback = raw.playback === 'momentary' || raw.playback === 'hold'
    ? raw.playback
    : fallback.playback || 'hold';
  const expression = typeof raw.expression === 'string' && ALLOWED_EXPRESSIONS.includes(raw.expression)
    ? raw.expression
    : fallback.expression;
  const speech = raw.speech && typeof raw.speech === 'object' && !Array.isArray(raw.speech)
    ? raw.speech
    : fallback.speech;
  const props = Array.isArray(raw.props) ? raw.props : fallback.props;

  return {
    ...fallback,
    pose,
    playback,
    ...(expression === undefined ? {} : { expression }),
    ...(speech === undefined ? {} : { speech }),
    ...(props === undefined ? {} : { props }),
  };
}

function compactEvent(event: JsonRecord): JsonRecord {
  const source = event.source && typeof event.source === 'object' ? event.source as JsonRecord : {};
  return {
    action: event.action,
    mode: event.mode,
    text: event.text,
    message: event.message,
    source: {
      agent: source.agent,
      phase: source.phase,
      kind: source.kind,
    },
  };
}

function compactContext(context: JsonRecord): JsonRecord {
  const recentEvents = Array.isArray(context.recentEvents)
    ? context.recentEvents.slice(-5).map((event) => compactEvent(event as JsonRecord))
    : [];
  return {
    ownerAgent: context.ownerAgent,
    visiblePose: context.visiblePose,
    activeSessionAction: context.activeSessionAction,
    recentErrors: Array.isArray(context.recentErrors) ? context.recentErrors.slice(-3) : [],
    lastPlan: context.lastPlan,
    recentEvents,
  };
}

function plannerPayload(config: AIPlannerConfig, request: AIPlanRequest): JsonRecord {
  return {
    event: compactEvent(request.event),
    context: compactContext(request.context),
    ...(config.mode === 'hybrid' ? { rulePlan: request.rulePlan } : {}),
    outputShape: {
      pose: 'terminal',
      playback: 'hold',
      expression: 'focused',
      props: [{ name: 'microphone', enabled: true }],
      speech: { text: 'short bubble text' },
    },
  };
}

function buildPlannerMessages(config: AIPlannerConfig, request: AIPlanRequest): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
  return [
    {
      role: 'system',
      content: [
        'You are ViviPet behavior planner.',
        'Return only compact JSON. No markdown.',
        `Allowed pose values: ${ALLOWED_POSES.join(', ')}.`,
        `Allowed expression values: ${ALLOWED_EXPRESSIONS.join(', ')}.`,
        'Never output Live2D parameters. Use semantic props only.',
        'Keep speech short and optional.',
      ].join('\n'),
    },
    {
      role: 'user',
      content: JSON.stringify(plannerPayload(config, request)),
    },
  ];
}

export class AIPlannerService {
  private config: AIPlannerConfig;

  constructor() {
    this.config = loadAIPlannerConfig();
  }

  getConfig(): AIPlannerConfig {
    return { ...this.config };
  }

  setConfig(partial: Partial<AIPlannerConfig>): AIPlannerConfig {
    this.config = { ...this.config, ...partial };
    this.config.baseUrl = normalizeBaseUrl(this.config.baseUrl);
    saveAIPlannerConfig(this.config);
    return this.getConfig();
  }

  resetConfig(): AIPlannerConfig {
    this.config = getDefaultAIPlannerConfig();
    saveAIPlannerConfig(this.config);
    return this.getConfig();
  }

  async testConnection(partial?: Partial<AIPlannerConfig>): Promise<{ ok: boolean; error?: string }> {
    const config = { ...this.config, ...partial };
    config.baseUrl = normalizeBaseUrl(config.baseUrl);
    try {
      if (!config.apiKey.trim()) throw new Error('API key is required');
      if (!config.model.trim()) throw new Error('Model is required');
      const client = makeClient(config);
      await withTimeout(client.chat.completions.create({
        model: config.model,
        messages: buildPlannerMessages(config, {
          event: { action: 'terminal', mode: 'continuous', source: { phase: 'tool:start', kind: 'bash' } },
          context: { visiblePose: 'terminal', recentEvents: [], recentErrors: [] },
          rulePlan: { pose: 'terminal', playback: 'hold', expression: 'focused', props: [] },
        }),
        temperature: 0,
        max_tokens: 120,
      }), config.timeoutMs);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Unknown AI connection error' };
    }
  }

  async plan(request: AIPlanRequest): Promise<AIPlanResult> {
    if (!this.config.enabled || this.config.mode === 'rule') {
      return { ok: false, error: 'AI planner is disabled' };
    }
    if (!this.config.apiKey.trim()) {
      return { ok: false, error: 'AI planner API key is missing' };
    }

    try {
      const client = makeClient(this.config);
      const createParams: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming = {
        model: this.config.model,
        temperature: 0.2,
        max_tokens: 180,
        messages: buildPlannerMessages(this.config, request),
      };
      const completion = await withTimeout(client.chat.completions.create(createParams), this.config.timeoutMs);

      const content = completion.choices[0]?.message?.content || '';
      const rawPlan = extractJson(content);
      return { ok: true, plan: sanitizePlan(rawPlan, request.rulePlan) };
    } catch (err) {
      log.warn('[AIPlanner] plan failed:', err);
      return { ok: false, error: err instanceof Error ? err.message : 'Unknown AI planner error' };
    }
  }
}

let instance: AIPlannerService | null = null;

export function getAIPlannerService(): AIPlannerService {
  if (!instance) instance = new AIPlannerService();
  return instance;
}
