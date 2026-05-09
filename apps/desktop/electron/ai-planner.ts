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

const AI_BEHAVIOR_TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'pet_noop',
      description: 'Keep the current pet behavior unchanged for noisy, repeated, or low-value events.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          reason: { type: 'string' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'pet_set_pose',
      description: 'Choose the visible semantic pose for the pet.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        required: ['pose'],
        properties: {
          pose: { type: 'string', enum: ALLOWED_POSES },
          playback: { type: 'string', enum: ['hold', 'momentary'] },
          intensity: { type: 'number', minimum: 0, maximum: 1 },
          interrupt: { type: 'boolean' },
          reason: { type: 'string' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'pet_set_expression',
      description: 'Choose the facial expression layer for the current behavior.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        required: ['expression'],
        properties: {
          expression: { type: 'string', enum: ALLOWED_EXPRESSIONS },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'pet_set_props',
      description: 'Enable or disable semantic character props.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        required: ['props'],
        properties: {
          props: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['name', 'enabled'],
              properties: {
                name: { type: 'string', enum: ['microphone', 'gamepad', 'catHands'] },
                enabled: { type: 'boolean' },
              },
            },
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'pet_say',
      description: 'Show a short Chinese speech bubble for the pet.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        required: ['text'],
        properties: {
          text: { type: 'string' },
          tts: { type: 'boolean' },
        },
      },
    },
  },
];

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

function messageText(message: unknown): string {
  if (!message || typeof message !== 'object') return '';
  const record = message as JsonRecord;
  const content = record.content;
  if (typeof content === 'string' && content.trim()) return content;
  if (Array.isArray(content)) {
    const parts = content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part && typeof part === 'object') {
          const value = (part as JsonRecord).text;
          return typeof value === 'string' ? value : '';
        }
        return '';
      })
      .join('');
    if (parts.trim()) return parts;
  }
  const reasoningContent = record.reasoning_content;
  return typeof reasoningContent === 'string' ? reasoningContent : '';
}

function extractJson(text: string): JsonRecord {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  try {
    return JSON.parse(cleaned) as JsonRecord;
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('AI response did not contain JSON');
    return JSON.parse(match[0]) as JsonRecord;
  }
}

function parseToolArguments(raw: string | undefined): JsonRecord {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as JsonRecord;
  } catch {
    return {};
  }
}

function planFromToolCalls(toolCalls: OpenAI.Chat.Completions.ChatCompletionMessageToolCall[] | undefined, fallback: JsonRecord): JsonRecord | null {
  if (!toolCalls?.length) return null;

  const rawPlan: JsonRecord = {};
  let calledBehaviorTool = false;
  let noopReason: string | undefined;

  for (const call of toolCalls) {
    if (call.type !== 'function') continue;
    const name = call.function.name;
    const args = parseToolArguments(call.function.arguments);

    if (name === 'pet_noop') {
      noopReason = typeof args.reason === 'string' ? args.reason : 'No visible change needed';
      continue;
    }

    calledBehaviorTool = true;
    if (name === 'pet_set_pose') {
      rawPlan.pose = args.pose;
      rawPlan.playback = args.playback;
      rawPlan.intensity = args.intensity;
      rawPlan.interrupt = args.interrupt;
      rawPlan.reason = args.reason;
    } else if (name === 'pet_set_expression') {
      rawPlan.expression = args.expression;
    } else if (name === 'pet_set_props') {
      rawPlan.props = args.props;
    } else if (name === 'pet_say') {
      rawPlan.speech = {
        text: typeof args.text === 'string' ? args.text : '',
        ...(typeof args.tts === 'boolean' ? { tts: args.tts } : {}),
      };
    }
  }

  if (!calledBehaviorTool) {
    return { ...fallback, shouldAct: false, reason: noopReason };
  }

  if (!rawPlan.pose && rawPlan.speech) {
    rawPlan.pose = 'speaking';
  }
  return { ...rawPlan, shouldAct: true };
}

function sanitizePlan(raw: JsonRecord, fallback: JsonRecord): JsonRecord {
  const shouldAct = typeof raw.shouldAct === 'boolean'
    ? raw.shouldAct
    : fallback.shouldAct ?? true;
  const pose = typeof raw.pose === 'string' && ALLOWED_POSES.includes(raw.pose)
    ? raw.pose
    : fallback.pose;
  const playback = raw.playback === 'momentary' || raw.playback === 'hold'
    ? raw.playback
    : fallback.playback || 'hold';
  const expression = typeof raw.expression === 'string' && ALLOWED_EXPRESSIONS.includes(raw.expression)
    ? raw.expression
    : fallback.expression;
  const rawSpeech = raw.speech && typeof raw.speech === 'object' && !Array.isArray(raw.speech)
    ? raw.speech as JsonRecord
    : undefined;
  const speech = rawSpeech && typeof rawSpeech.text === 'string' && rawSpeech.text.trim()
    ? { ...rawSpeech, text: rawSpeech.text.trim() }
    : fallback.speech;
  const props = Array.isArray(raw.props) ? raw.props : fallback.props;
  const intensity = typeof raw.intensity === 'number' && Number.isFinite(raw.intensity)
    ? Math.max(0, Math.min(1, raw.intensity))
    : fallback.intensity;
  const interrupt = typeof raw.interrupt === 'boolean'
    ? raw.interrupt
    : fallback.interrupt;
  const reason = typeof raw.reason === 'string' && raw.reason.trim()
    ? raw.reason.trim().slice(0, 160)
    : fallback.reason;

  return {
    ...fallback,
    shouldAct,
    pose,
    playback,
    ...(expression === undefined ? {} : { expression }),
    ...(speech === undefined ? {} : { speech }),
    ...(props === undefined ? {} : { props }),
    ...(intensity === undefined ? {} : { intensity }),
    ...(interrupt === undefined ? {} : { interrupt }),
    ...(reason === undefined ? {} : { reason }),
  };
}

function compactEvent(event: JsonRecord): JsonRecord {
  const source = event.source && typeof event.source === 'object' ? event.source as JsonRecord : {};
  const metadata = event.metadata && typeof event.metadata === 'object' && !Array.isArray(event.metadata)
    ? event.metadata as JsonRecord
    : {};
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
    ...(metadata.aggregate ? { aggregate: metadata.aggregate } : {}),
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
  const ruleSpeech = request.rulePlan.speech && typeof request.rulePlan.speech === 'object'
    ? request.rulePlan.speech as JsonRecord
    : {};
  const inputSpeech = typeof request.event.text === 'string'
    ? request.event.text
    : typeof request.event.message === 'string'
      ? request.event.message
      : typeof ruleSpeech.text === 'string'
        ? ruleSpeech.text
        : undefined;

  return {
    event: compactEvent(request.event),
    context: compactContext(request.context),
    ...(config.mode === 'hybrid' ? { rulePlan: request.rulePlan } : {}),
    speechPolicy: {
      inputText: inputSpeech,
      required: Boolean(inputSpeech),
      instruction: 'When inputText exists, return speech.text as a short in-character Chinese line. Do not simply copy inputText unless it is already natural character speech.',
    },
    outputShape: {
      shouldAct: true,
      pose: 'terminal',
      playback: 'hold',
      expression: 'focused',
      intensity: 0.6,
      interrupt: false,
      props: [{ name: 'microphone', enabled: true }],
      speech: { text: 'short bubble text' },
      reason: 'short reason',
    },
  };
}

function buildPlannerMessages(config: AIPlannerConfig, request: AIPlanRequest): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
  return [
    {
      role: 'system',
      content: [
        'You are ViviPet behavior agent.',
        'Use the provided tools to control the desktop pet. Do not write prose.',
        'Prefer calling tools over returning JSON text.',
        `Allowed pose values: ${ALLOWED_POSES.join(', ')}.`,
        `Allowed expression values: ${ALLOWED_EXPRESSIONS.join(', ')}.`,
        'Call pet_noop for low-value repeated events, noisy tool success, or when current pose should continue silently.',
        'Call behavior tools for errors, session end, waiting for user, visible phase changes, or useful user-facing status.',
        'For activity:summary events, treat the aggregate as an observation window. Act only if the window deserves visible presence; otherwise call pet_noop.',
        'Use intensity from 0 to 1. Subtle routine updates are 0.25-0.45. Errors/success can be 0.7-1.',
        'Use interrupt=false when the current ongoing pose should not be disturbed. Use interrupt=true for error/success.',
        'Never output Live2D parameters. Use semantic props only.',
        'If speechPolicy.required is true and you act, call pet_say.',
        'Rewrite speech into a short natural Chinese character line, usually under 30 Chinese characters.',
        'Do not simply echo raw technical messages unless they already sound like character dialogue.',
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
          rulePlan: { shouldAct: true, pose: 'terminal', playback: 'hold', expression: 'focused', intensity: 0.5, interrupt: false, props: [] },
        }),
        temperature: 0,
        max_tokens: 800,
        tools: AI_BEHAVIOR_TOOLS,
        tool_choice: 'auto',
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
        max_tokens: 800,
        messages: buildPlannerMessages(this.config, request),
        tools: AI_BEHAVIOR_TOOLS,
        tool_choice: 'auto',
      };
      const completion = await withTimeout(client.chat.completions.create(createParams), this.config.timeoutMs);

      const choice = completion.choices[0];
      const toolPlan = planFromToolCalls(choice?.message?.tool_calls, request.rulePlan);
      if (toolPlan) {
        return { ok: true, plan: sanitizePlan(toolPlan, request.rulePlan) };
      }

      const content = messageText(choice?.message);
      let rawPlan: JsonRecord;
      try {
        rawPlan = extractJson(content);
      } catch (err) {
        log.warn('[AIPlanner] invalid JSON content:', {
          finishReason: choice?.finish_reason,
          content: content.slice(0, 500),
        });
        throw err;
      }
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
