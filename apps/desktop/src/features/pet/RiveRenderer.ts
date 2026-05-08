import { Rive, StateMachineInput, StateMachineInputType } from '@rive-app/canvas';
import { PetRenderer, PlayActionOptions } from './PetRenderer';
import { ModelConfig } from './model-registry';
import { RIVE_INPUTS, RiveStateValue } from './rive-inputs';

interface RiveInstance {
  rive: Rive;
  canvas: HTMLCanvasElement;
  stateMachineName: string;
}

export class RiveRenderer implements PetRenderer {
  private instances: RiveInstance[] = [];
  private mainCanvas: HTMLCanvasElement | null = null;
  private bgCanvas: HTMLCanvasElement | null = null;
  private currentAction: string = 'idle';
  private disposed = false;

  get view(): HTMLCanvasElement | null {
    return this.mainCanvas;
  }

  get backgroundCanvas(): HTMLCanvasElement | null {
    return this.bgCanvas;
  }

  async loadModel(modelConfig: ModelConfig): Promise<void> {
    this.cleanupInstances();

    this.mainCanvas = document.createElement('canvas');
    this.mainCanvas.className = 'rive-character-canvas';
    this.mainCanvas.style.display = 'block';

    this.bgCanvas = document.createElement('canvas');
    this.bgCanvas.className = 'rive-background-canvas';
    this.bgCanvas.style.display = 'block';
    this.bgCanvas.style.position = 'absolute';
    this.bgCanvas.style.top = '0';
    this.bgCanvas.style.left = '0';
    this.bgCanvas.style.pointerEvents = 'none';

    const smName = 'State Machine 1';

    const charBuffer = await this.fetchModel(modelConfig.path);
    const charRive = new Rive({
      buffer: charBuffer,
      canvas: this.mainCanvas,
      autoplay: true,
      stateMachines: smName,
      onLoad: () => {
        charRive.resizeToCanvas();
        this.setRiveStateInputs(charRive, smName, 'idle');
      },
    });

    this.instances.push({
      rive: charRive,
      canvas: this.mainCanvas,
      stateMachineName: smName,
    });

    try {
      const bgBuffer = await this.fetchModel(modelConfig.path);
      const bgSmName = 'Background SM';
      const bgRive = new Rive({
        buffer: bgBuffer,
        canvas: this.bgCanvas,
        autoplay: true,
        artboard: 'background',
        stateMachines: bgSmName,
        onLoad: () => bgRive.resizeToCanvas(),
      });
      this.instances.push({
        rive: bgRive,
        canvas: this.bgCanvas,
        stateMachineName: bgSmName,
      });
    } catch {
      console.log('[RiveRenderer] No background artboard found');
    }
  }

  async playAction(actionName: string, options?: PlayActionOptions): Promise<void> {
    this.currentAction = actionName;
    const stateValue = this.actionToState(actionName);
    for (const inst of this.instances) {
      this.setRiveStateInputs(inst.rive, inst.stateMachineName, stateValue);
    }
  }

  async playMotion(group: string, index?: number, options?: PlayActionOptions): Promise<void> {
    this.playAction(group, options);
  }

  async setExpression(name: string): Promise<void> {
  }

  setParameters(params: Record<string, number>): void {
  }

  setSpeaking(speaking: boolean, amplitude?: number): void {
  }

  async speak(text: string): Promise<void> {
  }

  lookAt(x: number, y: number): void {
  }

  resetPointer(): void {
  }

  resize(width: number, height: number): void {
    const dpr = window.devicePixelRatio || 1;
    if (this.mainCanvas) {
      this.mainCanvas.width = width * dpr;
      this.mainCanvas.height = height * dpr;
      this.mainCanvas.style.width = `${width}px`;
      this.mainCanvas.style.height = `${height}px`;
    }
    if (this.bgCanvas) {
      this.bgCanvas.width = window.innerWidth * dpr;
      this.bgCanvas.height = window.innerHeight * dpr;
      this.bgCanvas.style.width = `${window.innerWidth}px`;
      this.bgCanvas.style.height = `${window.innerHeight}px`;
    }
    for (const inst of this.instances) {
      inst.rive.resizeToCanvas();
    }
  }

  idle(): void {
    this.playAction('idle');
  }

  destroy(): void {
    this.disposed = true;
    this.cleanupInstances();
    this.mainCanvas = null;
    this.bgCanvas = null;
  }

  private actionToState(action: string): RiveStateValue {
    const validStates: RiveStateValue[] = ['idle', 'thinking', 'speaking', 'happy', 'error',
      'searching', 'coding', 'terminal', 'confused', 'angry'];
    return validStates.includes(action as RiveStateValue) ? action as RiveStateValue : 'idle';
  }

  private setRiveStateInputs(rive: Rive, smName: string, stateValue: RiveStateValue): void {
    const inputs = rive.stateMachineInputs(smName);
    for (const input of inputs) {
      if (input.type === StateMachineInputType.Trigger) {
        if (input.name === stateValue) {
          input.fire();
        }
      } else if (input.type === StateMachineInputType.Number) {
        if (input.name === RIVE_INPUTS.STATE) {
          const stateIndex: Record<string, number> = {
            idle: 0, thinking: 1, speaking: 2, happy: 3, error: 4,
            searching: 5, coding: 6, terminal: 7, confused: 8, angry: 9,
          };
          (input as StateMachineInput).value = stateIndex[stateValue] ?? 0;
        }
      } else if (input.type === StateMachineInputType.Boolean) {
        if (input.name === stateValue) {
          (input as StateMachineInput).value = true;
        }
      }
    }
  }

  private async fetchModel(path: string): Promise<ArrayBuffer> {
    const response = await fetch(path);
    if (!response.ok) throw new Error(`Failed to load model: HTTP ${response.status}`);
    return response.arrayBuffer();
  }

  private cleanupInstances(): void {
    for (const inst of this.instances) {
      inst.rive.cleanup();
    }
    this.instances = [];
  }
}
