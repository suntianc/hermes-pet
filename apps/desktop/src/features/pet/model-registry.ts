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
  offset?: {
    x?: number;
    y?: number;
  };
  padding?: number;
  scale?: number;
}

interface ModelRegistryFile {
  models?: ModelConfig[];
}

export const FALLBACK_MODELS: ModelConfig[] = [
  {
    id: 'meruru',
    name: 'Meruru',
    path: './models/meruru/Meruru - Model - Mark.model3.json',
    window: { width: 520, height: 760 },
    canvas: { width: 520, height: 760 },
    offset: { x: 0, y: 0 },
    padding: 24,
    scale: 0.9,
  },
];

const MODEL_REGISTRY_PATH = './models/models.json';

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
    const response = await fetch(MODEL_REGISTRY_PATH, { cache: 'no-cache' });
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
