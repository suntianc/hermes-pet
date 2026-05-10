import { petModel } from '../../tauri-adapter';
import type { ModelConfigDTO } from '../../tauri-types';

export type ModelType = 'rive';

export interface ModelConfig {
  id: string;
  name: string;
  path: string;
  type?: ModelType;
  window?: {
    width: number;
    height: number;
  };
  canvas?: {
    width: number;
    height: number;
  };
  actions?: Record<string, ModelActionConfig>;
  capabilities?: ModelCapabilities;
}

export interface ModelCapabilities {
  expressions?: Record<string, string | null>;
  props?: Record<string, ModelPropCapability>;
  propFallbacks?: Record<string, string[]>;
}

export interface ModelPropCapability {
  enable?: Record<string, number>;
  disable?: Record<string, number>;
}

export interface ModelActionConfig {
  motion?: {
    group: string;
    index?: number;
    file?: string;
  };
  expression?: string;
  expressionFile?: string;
  resetExpressionAfterMs?: number;
}

interface ModelRegistryFile {
  models?: ModelConfig[];
}

export const FALLBACK_MODELS: ModelConfig[] = [];

const MODEL_REGISTRY_PATH = 'assets/models/models.json';

function resolvePublicAsset(path: string): string {
  const cleanPath = path.replace(/^\.\//, '').replace(/^\//, '');
  return window.location.protocol === 'file:' ? `./${cleanPath}` : `/${cleanPath}`;
}

function isValidModelConfig(model: Partial<ModelConfig>): model is ModelConfig {
  return Boolean(model.id && model.name && model.path);
}

export function getModelWindowSize(model: ModelConfig): { width: number; height: number } {
  return model.window ?? model.canvas ?? { width: 520, height: 760 };
}

export function getModelCanvasSize(model: ModelConfig): { width: number; height: number } {
  return model.canvas ?? model.window ?? { width: 520, height: 760 };
}

export async function loadModelConfigs(): Promise<ModelConfig[]> {
  // 1. Load built-in models from the bundled registry
  let builtIn: ModelConfig[] = [];
  try {
    const response = await fetch(resolvePublicAsset(MODEL_REGISTRY_PATH), { cache: 'no-cache' });
    if (response.ok) {
      const registry = await response.json() as ModelRegistryFile;
      builtIn = (registry.models ?? []).filter(isValidModelConfig);
    }
  } catch (err) {
    console.warn('[ModelRegistry] Failed to load model registry:', err);
  }

  if (builtIn.length === 0) {
    console.warn('[ModelRegistry] No built-in models, using fallback');
    builtIn = FALLBACK_MODELS;
  }

  // 2. Load user-imported models (via Tauri model_list)
  let userModels: ModelConfig[] = [];
  try {
    const remoteModels = await petModel.listModels();
    userModels = remoteModels
      .filter((m) => Boolean(m.id && m.name && m.path))
      .map((m: ModelConfigDTO) => ({
        id: m.id,
        name: m.name,
        path: m.path,
        window: m.window,
        canvas: m.canvas ?? (m.window ? { width: m.window.width, height: m.window.height } : undefined),
        actions: m.actions as Record<string, ModelActionConfig> | undefined,
        capabilities: m.capabilities as ModelCapabilities | undefined,
      }));
  } catch (err) {
    // Model list may fail if models dir doesn't exist yet — not critical
    console.warn('[ModelRegistry] Failed to list models via Tauri:', err);
  }

  // 3. Merge: user models override built-in models with same ID
  const builtInMap = new Map(builtIn.map((m) => [m.id, m]));
  for (const userModel of userModels) {
    builtInMap.set(userModel.id, userModel);
  }

  return Array.from(builtInMap.values());
}
