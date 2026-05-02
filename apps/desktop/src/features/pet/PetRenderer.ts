import { ModelConfig } from './model-registry';

export interface PetRenderer {
  loadModel(modelConfig: ModelConfig): Promise<void>;
  playMotion(group: string, index?: number): Promise<void>;
  setExpression(name: string): Promise<void>;
  speak(text: string): Promise<void>;
  lookAt(x: number, y: number): void;
  idle(): void;
  destroy(): void;
}

export type PetRendererType = 'live2d' | 'spine' | 'gif' | 'vrm';

export interface RendererConfig {
  type: PetRendererType;
  modelPath: string;
  autoFit?: boolean;
}
