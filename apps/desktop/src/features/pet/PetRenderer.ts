import { ModelConfig } from './model-registry';

export interface PlayActionOptions {
  playback?: 'hold' | 'restart' | 'momentary';
}

export interface PetRenderer {
  loadModel(modelConfig: ModelConfig): Promise<void>;
  playAction(actionName: string, options?: PlayActionOptions): Promise<void>;
  playMotion(group: string, index?: number, options?: PlayActionOptions): Promise<void>;
  setExpression(name: string): Promise<void>;
  setParameters(params: Record<string, number>): void;
  setSpeaking(speaking: boolean, amplitude?: number): void;
  speak(text: string): Promise<void>;
  lookAt(x: number, y: number): void;
  resetPointer(): void;
  resize(width: number, height: number): void;
  idle(): void;
  destroy(): void;
}

export type PetRendererType = 'spine' | 'gif' | 'vrm';

export interface RendererConfig {
  type: PetRendererType;
  modelPath: string;
  autoFit?: boolean;
}
