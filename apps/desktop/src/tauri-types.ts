/**
 * Tauri IPC 类型定义
 *
 * 镜像 Rust 端的命令参数/返回值类型，供 tauri-adapter.ts 使用
 */

// ── 窗口相关 ──────────────────────────────────────────────────────────

export interface Position2D {
  x: number;
  y: number;
}

// ── 模型相关 ──────────────────────────────────────────────────────────

export interface WindowSize {
  width: number;
  height: number;
}

export interface MotionConfig {
  group: string;
  index?: number;
  file?: string;
}

export interface ModelActionConfig {
  motion?: MotionConfig;
  expression?: string;
  expression_file?: string;
  reset_expression_after_ms?: number;
}

export interface ModelCapabilities {
  expressions?: Record<string, string | null>;
  props?: Record<string, ModelPropCapability>;
  prop_fallbacks?: Record<string, string[]>;
}

export interface ModelPropCapability {
  enable?: Record<string, number>;
  disable?: Record<string, number>;
}

/** 镜像 Rust models::ModelConfig */
export interface ModelConfigDTO {
  id: string;
  name: string;
  path: string;
  type?: string;
  window?: WindowSize;
  canvas?: WindowSize;
  actions?: Record<string, ModelActionConfig>;
  capabilities?: ModelCapabilities;
}

// ── AI 相关 ───────────────────────────────────────────────────────────

export type PlannerMode = 'rule' | 'ai' | 'hybrid';

/** 镜像 Rust ai::AiConfig */
export interface AiConfigDTO {
  enabled: boolean;
  mode: PlannerMode;
  base_url: string;
  api_key: string;
  model: string;
  timeout_ms: number;
  fallback_to_rule: boolean;
}

/** AI plan 请求 */
export interface AiPlanRequest {
  event: { action: string; mode: string; text?: string; message?: string };
  context: { visiblePose: string; recentEvents: unknown[] };
}

/** AI plan 响应 */
export interface AiPlanResponse {
  ok: boolean;
  plan?: {
    pose: string;
    playback: 'hold' | 'momentary';
    speech?: { text: string; tts?: boolean };
    expression?: string;
    props?: unknown[];
    interrupt?: boolean;
    shouldAct?: boolean;
  };
  mode: string;
  error?: string;
}

/** TTS 连接测试结果 */
export interface AiTestResult {
  ok: boolean;
  error?: string;
}

// ── TTS 相关 ──────────────────────────────────────────────────────────

export type TTSProviderType = 'None' | 'System' | 'Local' | 'Cloud';

export interface TTSConfigDTO {
  enabled: boolean;
  max_chars: number;
  source: TTSProviderType;
  interruption_strategy: string;
  chunk_size: number;
  fallback_to_bubble: boolean;
  system?: { voice?: string; rate?: number } | null;
  local?: { url: string; format?: string } | null;
  cloud?: { provider: string; api_key?: string; voice?: string; model?: string; endpoint?: string } | null;
}

// ── 事件相关 ──────────────────────────────────────────────────────────

/** Tauri emit 事件负载：pet:action */
export interface PetActionEvent {
  action: string;
  scale?: number;
  [key: string]: unknown;
}
