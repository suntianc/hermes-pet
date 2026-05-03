export interface ModelConfig {
  id: string;
  name: string;
  path: string;
  window?: {
    width: number;
    height: number;
  };
  canvas?: {
    width: number;
    height: number;
  };
  actions?: Record<string, ModelActionConfig>;
}

export interface ModelActionConfig {
  motion?: {
    group: string;
    index?: number;
  };
  expression?: string;
  resetExpressionAfterMs?: number;
}

interface ModelRegistryFile {
  models?: ModelConfig[];
}

export const FALLBACK_MODELS: ModelConfig[] = [
  {
    id: 'jian',
    name: 'Jian',
    path: 'models/Jian/Jian.model3.json',
    window: { width: 1000, height: 900 },
    canvas: { width: 1000, height: 900 },
    actions: {
      idle: { motion: { group: 'Idle', index: 0 } },
      thinking: { motion: { group: 'Idle', index: 0 }, expression: 'StarEyes' },
      speaking: { motion: { group: 'Idle', index: 0 }, expression: 'Blush' },
      happy: { motion: { group: 'Idle', index: 0 }, expression: 'HeartEyes' },
      success: { motion: { group: 'Idle', index: 0 }, expression: 'StarEyes' },
      error: { motion: { group: 'Idle', index: 0 }, expression: 'DarkFace' },
      confused: { motion: { group: 'Idle', index: 0 }, expression: 'WhiteEyes' },
      angry: { motion: { group: 'Idle', index: 0 }, expression: 'Angry' },
      searching: { motion: { group: 'Idle', index: 0 }, expression: 'StarEyes' },
      reading: { motion: { group: 'Idle', index: 0 }, expression: 'RightHand' },
      coding: { motion: { group: 'Idle', index: 0 }, expression: 'LeftHand' },
      terminal: { motion: { group: 'Idle', index: 0 }, expression: 'WhiteEyes' },
      dragging: { motion: { group: 'Idle', index: 0 }, expression: 'Blush' },
      clicked: { motion: { group: 'Idle', index: 0 }, expression: 'Blush', resetExpressionAfterMs: 700 },
      doubleClicked: { motion: { group: 'Idle', index: 0 }, expression: 'HeartEyes', resetExpressionAfterMs: 1000 },
    },
  },
];

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
  try {
    const response = await fetch(resolvePublicAsset(MODEL_REGISTRY_PATH), { cache: 'no-cache' });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const registry = await response.json() as ModelRegistryFile;
    const models = (registry.models ?? []).filter(isValidModelConfig);
    if (models.length === 0) {
      throw new Error('No valid models found');
    }

    return models;
  } catch (err) {
    console.warn('[ModelRegistry] Failed to load model registry, using fallback:', err);
    return FALLBACK_MODELS;
  }
}
