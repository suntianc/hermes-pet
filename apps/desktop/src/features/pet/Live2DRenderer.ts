import * as PIXI from 'pixi.js';
import { Live2DModel, startUpCubism4 } from 'pixi-live2d-display/cubism4';
import { PetRenderer } from './PetRenderer';
import { getModelCanvasSize, ModelConfig } from './model-registry';

const EMOJIS = ['🦊', '🐱', '🐶', '🐰'];
const DEFAULT_CANVAS_WIDTH = 520;
const DEFAULT_CANVAS_HEIGHT = 760;

/**
 * Live2D renderer with Canvas2D emoji fallback.
 *
 * Loads Live2D model via pixi-live2d-display + PixiJS.
 * Falls back to Canvas2D emoji if Live2D initialization fails.
 */
export class Live2DRenderer implements PetRenderer {
  private app: PIXI.Application | null = null;
  private model: any = null;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private isInitialized = false;
  private useFallback = false;
  private currentModelIndex = 0;
  private animationFrame: number | null = null;
  private fallbackEmoji = EMOJIS[0];
  private canvasWidth = DEFAULT_CANVAS_WIDTH;
  private canvasHeight = DEFAULT_CANVAS_HEIGHT;
  private modelScale = 0.9;
  private modelOffsetX = 0;
  private modelOffsetY = 0;
  private modelPadding = 24;
  private loadVersion = 0;

  get view(): HTMLCanvasElement | null {
    return this.canvas;
  }

  get initialized(): boolean {
    return this.isInitialized;
  }

  hitTestClientPoint(clientX: number, clientY: number, alphaThreshold = 18): boolean {
    if (!this.canvas) return false;

    const rect = this.canvas.getBoundingClientRect();
    if (
      clientX < rect.left ||
      clientX > rect.right ||
      clientY < rect.top ||
      clientY > rect.bottom
    ) {
      return false;
    }

    const pixelX = Math.floor(((clientX - rect.left) / rect.width) * this.canvas.width);
    const pixelY = Math.floor(((clientY - rect.top) / rect.height) * this.canvas.height);

    if (this.useFallback && this.ctx) {
      try {
        return this.ctx.getImageData(pixelX, pixelY, 1, 1).data[3] >= alphaThreshold;
      } catch {
        return true;
      }
    }

    if (!this.app) return false;

    try {
      const renderer = this.app.renderer as any;
      const gl: WebGLRenderingContext | WebGL2RenderingContext | undefined = renderer.gl;
      if (!gl) return true;

      const pixels = new Uint8Array(4);
      gl.readPixels(
        pixelX,
        this.canvas.height - pixelY - 1,
        1,
        1,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        pixels,
      );
      return pixels[3] >= alphaThreshold;
    } catch {
      return true;
    }
  }

  async loadModel(modelConfig: ModelConfig): Promise<void> {
    const version = ++this.loadVersion;
    try {
      await this.initLive2D(modelConfig, version);
    } catch (err) {
      console.warn('[Live2DRenderer] Live2D init failed, falling back to emoji:', err);
      this.initFallback();
    }
  }

  private applyModelConfig(modelConfig: ModelConfig): void {
    const canvasSize = getModelCanvasSize(modelConfig);
    this.canvasWidth = canvasSize.width;
    this.canvasHeight = canvasSize.height;
    this.modelScale = modelConfig.scale ?? 0.9;
    this.modelOffsetX = modelConfig.offset?.x ?? 0;
    this.modelOffsetY = modelConfig.offset?.y ?? 0;
    this.modelPadding = modelConfig.padding ?? 24;
  }

  private async initLive2D(modelConfig: ModelConfig, version: number): Promise<void> {
    this.applyModelConfig(modelConfig);

    // Resolve path for Electron custom protocol
    const isElectron = navigator.userAgent.toLowerCase().includes('electron');
    const modelPath = modelConfig.path;
    const finalPath = isElectron
      ? `local-model://${modelPath.replace(/^\.\//, '')}`
      : modelPath;

    // Create PIXI Application with transparent background for Electron
    this.app = new PIXI.Application({
      width: this.canvasWidth,
      height: this.canvasHeight,
      backgroundAlpha: 0,
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      preserveDrawingBuffer: true,
    });

    this.canvas = this.app.view as HTMLCanvasElement;
    this.updateCanvasElementSize();

    // Initialize Cubism 4 framework
    startUpCubism4({
      logFunction: console.log,
      loggingLevel: 2, // LOG_LEVEL_ERROR – suppress verbose Cubism logging
    });

    // Register PIXI ticker for Live2D model auto-updates
    if (PIXI.Ticker && typeof Live2DModel.registerTicker === 'function') {
      Live2DModel.registerTicker(PIXI.Ticker);
    }

    // Load and create the Live2D model
    const model = await Live2DModel.from(finalPath, {
      autoUpdate: true,
      autoInteract: true,
    });

    // Guard: if renderer was destroyed during the async load (e.g. React 18
    // Strict Mode double-mount in dev), clean up and abort gracefully.
    if (!this.app || version !== this.loadVersion) {
      model.destroy();
      throw new Error('Renderer destroyed or superseded during async model load');
    }

    this.clearStage();
    this.model = model;

    // Add model to the stage
    this.app.stage.addChild(model);

    // Center and scale the model to fit the canvas
    this.fitModel();

    // Start the PIXI render loop
    this.app.start();

    this.useFallback = false;
    this.isInitialized = true;
    console.log('[Live2DRenderer] Live2D model loaded successfully');
  }

  private initFallback(): void {
    if (!this.canvas) {
      this.canvas = document.createElement('canvas');
      this.canvas.width = this.canvasWidth;
      this.canvas.height = this.canvasHeight;
      this.updateCanvasElementSize();
    }

    // Clean up PIXI Application if it was partially created
    if (this.app) {
      try {
        this.app.destroy(true, { children: true, texture: true });
      } catch {
        // Ignore cleanup errors
      }
      this.app = null;
    }

    this.ctx = this.canvas.getContext('2d');
    this.fallbackEmoji = EMOJIS[this.currentModelIndex % EMOJIS.length];
    this.useFallback = true;
    this.isInitialized = true;

    this.startFallbackAnimation();
    console.log('[Live2DRenderer] Using emoji fallback pet display');
  }

  private fitModel(): void {
    if (!this.model || !this.app) return;

    try {
      if (typeof this.model.anchor?.set === 'function') {
        this.model.anchor.set(0);
      }

      this.model.scale.set(1);
      this.model.position.set(0, 0);

      const bounds = this.getDrawableBounds() ?? this.model.getLocalBounds();
      const boundsWidth = bounds.width || this.canvasWidth;
      const boundsHeight = bounds.height || this.canvasHeight;
      const fitWidth = Math.max(1, this.canvasWidth - this.modelPadding * 2);
      const fitHeight = Math.max(1, this.canvasHeight - this.modelPadding * 2);
      const scale = Math.min(fitWidth / boundsWidth, fitHeight / boundsHeight) * this.modelScale;

      this.model.scale.set(scale);
      this.model.position.set(
        (this.canvasWidth - boundsWidth * scale) / 2 - bounds.x * scale + this.modelOffsetX,
        (this.canvasHeight - boundsHeight * scale) / 2 - bounds.y * scale + this.modelOffsetY,
      );
    } catch (err) {
      console.warn('[Live2DRenderer] Failed to fit model:', err);
    }
  }

  private getDrawableBounds(): { x: number; y: number; width: number; height: number } | null {
    const internalModel = this.model?.internalModel;
    if (!internalModel || typeof internalModel.getDrawableVertices !== 'function') {
      return null;
    }

    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    const drawableIds = typeof internalModel.getDrawableIDs === 'function'
      ? internalModel.getDrawableIDs()
      : [];
    const drawableCount = drawableIds.length || internalModel.coreModel?.getDrawableCount?.() || 0;

    for (let i = 0; i < drawableCount; i += 1) {
      const drawableKey = drawableIds[i] ?? i;
      let vertices: Float32Array | number[] | undefined;

      try {
        vertices = internalModel.getDrawableVertices(drawableKey);
      } catch {
        vertices = undefined;
      }

      if (!vertices) continue;

      for (let vertexIndex = 0; vertexIndex < vertices.length; vertexIndex += 2) {
        const x = vertices[vertexIndex];
        const y = vertices[vertexIndex + 1];
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;

        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }

    if (!Number.isFinite(minX) || !Number.isFinite(minY) || maxX <= minX || maxY <= minY) {
      return null;
    }

    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
    };
  }

  private updateCanvasElementSize(): void {
    if (!this.canvas) return;
    this.canvas.width = this.canvasWidth * (window.devicePixelRatio || 1);
    this.canvas.height = this.canvasHeight * (window.devicePixelRatio || 1);
    this.canvas.style.width = `${this.canvasWidth}px`;
    this.canvas.style.height = `${this.canvasHeight}px`;
  }

  private resizeRenderer(modelConfig: ModelConfig): void {
    this.applyModelConfig(modelConfig);
    this.app?.renderer.resize(this.canvasWidth, this.canvasHeight);
    this.updateCanvasElementSize();
  }

  private clearStage(): void {
    if (!this.app) return;

    if (this.model) {
      try {
        this.app.stage.removeChild(this.model);
        this.model.destroy();
      } catch {
        // Ignore cleanup errors
      }
      this.model = null;
    }

    for (const child of [...this.app.stage.children]) {
      try {
        this.app.stage.removeChild(child);
        child.destroy?.({ children: true, texture: false, baseTexture: false });
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  // ────────────────────────────────────────────────────────────
  //  Fallback – Canvas2D Emoji Animation
  // ────────────────────────────────────────────────────────────

  private startFallbackAnimation(): void {
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
    }
    const animate = () => {
      this.drawFallback();
      this.animationFrame = requestAnimationFrame(animate);
    };
    animate();
  }

  private drawFallback(): void {
    if (!this.ctx || !this.canvas) return;

    // Save context state and clear atomically
    this.ctx.save();
    this.ctx.clearRect(0, 0, this.canvasWidth, this.canvasHeight);

    // Gentle floating animation
    const offsetY = Math.sin(Date.now() / 1000) * 5;

    this.ctx.font = '120px Arial';
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    this.ctx.fillText(this.fallbackEmoji, this.canvasWidth / 2, this.canvasHeight / 2 + offsetY);
    this.ctx.restore();
  }

  // ────────────────────────────────────────────────────────────
  //  PetRenderer Interface
  // ────────────────────────────────────────────────────────────

  async playMotion(group: string, index: number = 0): Promise<void> {
    if (this.useFallback || !this.model) return;

    try {
      await this.model.motion(group, index);
    } catch (err) {
      console.warn(`[Live2DRenderer] Failed to play motion '${group}':`, err);
    }
  }

  async setExpression(name: string): Promise<void> {
    if (this.useFallback || !this.model) return;

    try {
      await this.model.expression(name);
    } catch (err) {
      console.warn(`[Live2DRenderer] Failed to set expression '${name}':`, err);
    }
  }

  async speak(_text: string): Promise<void> {
    if (this.useFallback) return;

    try {
      if (this.model?.internalModel?.motionManager) {
        await this.model.motion('Talk', 0);
      }
    } catch {
      // Motion "Talk" might not be defined for all models – acceptable
    }
  }

  lookAt(x: number, y: number): void {
    if (this.useFallback || !this.model) return;

    try {
      if (typeof this.model.focus === 'function') {
        this.model.focus(x, y);
      }
    } catch {
      // focus controller may not be initialised yet
    }
  }

  idle(): void {
    if (this.useFallback) return;

    try {
      if (this.model) {
        // Ensure an idle motion is queued (priority 1 = IDLE)
        this.model.motion('Idle', 0, 1);
      }
    } catch {
      // Model may not have an "Idle" motion group – built-in physics still run
    }
  }

  async switchModel(modelConfig: ModelConfig, fallbackIndex = 0): Promise<void> {
    if (!modelConfig) return;

    const version = ++this.loadVersion;
    this.currentModelIndex = fallbackIndex;
    this.fallbackEmoji = EMOJIS[fallbackIndex % EMOJIS.length];

    if (this.useFallback || !this.app) {
      return;
    }

    this.resizeRenderer(modelConfig);
    this.clearStage();

    // Load new model into the EXISTING PIXI app
    try {
      const isElectron = navigator.userAgent.toLowerCase().includes('electron');
      const modelPath = modelConfig.path;
      const finalPath = isElectron
        ? `local-model://${modelPath.replace(/^\.\//, '')}`
        : modelPath;

      const model = await Live2DModel.from(finalPath, {
        autoUpdate: true,
        autoInteract: true,
      });

      if (version !== this.loadVersion) {
        model.destroy();
        return;
      }

      this.clearStage();
      this.model = model;
      this.app.stage.addChild(model);
      this.fitModel();
      this.isInitialized = true;
      console.log(`[Live2DRenderer] Switched to model: ${modelConfig.name}`);
    } catch (err) {
      console.warn('[Live2DRenderer] Failed to switch model:', err);
      this.initFallback();
    }
  }

  destroy(): void {
    // Stop fallback animation loop
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }

    // Destroy Live2D model
    if (this.model) {
      try {
        this.app?.stage.removeChild(this.model);
        this.model.destroy();
      } catch {
        // Ignore cleanup errors
      }
      this.model = null;
    }

    // Destroy PIXI Application completely
    if (this.app) {
      try {
        this.app.stop();
        this.app.destroy(true, { children: true, texture: true });
      } catch {
        // Ignore cleanup errors
      }
      this.app = null;
    }

    this.canvas = null;
    this.ctx = null;
    this.isInitialized = false;
    this.useFallback = false;
  }
}
