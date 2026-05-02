import { CubismDefaultParameterId } from '@framework/cubismdefaultparameterid';
import { CubismModelSettingJson } from '@framework/cubismmodelsettingjson';
import { BreathParameterData, CubismBreath } from '@framework/effect/cubismbreath';
import { ICubismModelSetting } from '@framework/icubismmodelsetting';
import { CubismFramework, LogLevel, Option } from '@framework/live2dcubismframework';
import { CubismMatrix44 } from '@framework/math/cubismmatrix44';
import { CubismUserModel } from '@framework/model/cubismusermodel';
import { ACubismMotion } from '@framework/motion/acubismmotion';
import { CubismMotion } from '@framework/motion/cubismmotion';
import { CubismMotionQueueEntryHandle, InvalidMotionQueueEntryHandleValue } from '@framework/motion/cubismmotionqueuemanager';
import { CubismShaderManager_WebGL } from '@framework/rendering/cubismshader_webgl';
import { CubismIdHandle } from '@framework/id/cubismid';
import { PetRenderer } from './PetRenderer';
import { getModelCanvasSize, ModelActionConfig, ModelConfig } from './model-registry';

const SHADER_PATH = './Framework/Shaders/WebGL/';
const DEFAULT_CANVAS_WIDTH = 520;
const DEFAULT_CANVAS_HEIGHT = 760;
const PRIORITY_IDLE = 1;
const PRIORITY_NORMAL = 2;
const PRIORITY_FORCE = 3;

let frameworkReady = false;

function ensureCubismFramework(): void {
  if (frameworkReady) return;

  const option = new Option();
  option.logFunction = (message: string) => console.log(`[Cubism] ${message}`);
  option.loggingLevel = LogLevel.LogLevel_Warning;
  CubismFramework.startUp(option);
  CubismFramework.initialize();
  frameworkReady = true;
}

function toModelUrl(path: string): string {
  const cleanPath = path.replace(/^\.\//, '').replace(/^\//, '');
  return window.location.protocol === 'file:' ? `./${cleanPath}` : `/${cleanPath}`;
}

function dirname(url: string): string {
  return url.slice(0, url.lastIndexOf('/') + 1);
}

async function fetchArrayBuffer(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load ${url}: HTTP ${response.status}`);
  }
  return response.arrayBuffer();
}

async function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load texture ${url}`));
    image.src = url;
  });
}

function waitFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function createTexture(gl: WebGLRenderingContext, image: HTMLImageElement): WebGLTexture {
  const texture = gl.createTexture();
  if (!texture) {
    throw new Error('Failed to create WebGL texture');
  }

  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 1);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.bindTexture(gl.TEXTURE_2D, null);

  return texture;
}

class OfficialCubismModel extends CubismUserModel {
  private homeDir = '';
  private setting: ICubismModelSetting | null = null;
  private gl: WebGLRenderingContext;
  private motions = new Map<string, CubismMotion>();
  private expressions = new Map<string, ACubismMotion>();
  private textures: WebGLTexture[] = [];
  private eyeBlinkIds: CubismIdHandle[] = [];
  private lipSyncIds: CubismIdHandle[] = [];
  private breath: CubismBreath | null = null;
  private userTimeSeconds = 0;
  private ready = false;
  private disposed = false;

  constructor(gl: WebGLRenderingContext) {
    super();
    this.gl = gl;
  }

  async load(modelJsonUrl: string, canvasWidth: number, canvasHeight: number): Promise<void> {
    this.homeDir = dirname(modelJsonUrl);

    const modelJsonBuffer = await fetchArrayBuffer(modelJsonUrl);
    this.setting = new CubismModelSettingJson(modelJsonBuffer, modelJsonBuffer.byteLength);

    const mocFileName = this.setting.getModelFileName();
    if (!mocFileName) {
      throw new Error(`Model file is missing in ${modelJsonUrl}`);
    }

    const mocBuffer = await fetchArrayBuffer(this.homeDir + mocFileName);
    this.loadModel(mocBuffer, this._mocConsistency);

    await Promise.all([
      this.loadExpressions(),
      this.loadPhysicsFile(),
      this.loadEffectIds(),
      this.loadMotions(),
    ]);

    this.setupBreath();
    this.setupLayout();
    this.createRenderer(canvasWidth, canvasHeight);
    this.getRenderer().startUp(this.gl);
    this.getRenderer().setIsPremultipliedAlpha(true);
    this.getRenderer().loadShaders(SHADER_PATH);
    await this.waitForShaders();
    await this.loadTextures();

    if (this.disposed) return;

    this._model.saveParameters();
    this._motionManager.stopAllMotions();
    this._initialized = true;
    this._updating = false;
    this.ready = true;
  }

  update(deltaTimeSeconds: number): void {
    if (this.disposed || !this.ready || !this._model) return;

    this.userTimeSeconds += deltaTimeSeconds;
    this._model.loadParameters();

    if (this._motionManager.isFinished()) {
      this.startMotion('Idle', 0, PRIORITY_IDLE);
    } else {
      this._motionManager.updateMotion(this._model, deltaTimeSeconds);
    }

    this._model.saveParameters();
    this._expressionManager.updateMotion(this._model, deltaTimeSeconds);
    this._dragManager.update(deltaTimeSeconds);
    this.applyPointerLook();
    this.breath?.updateParameters(this._model, deltaTimeSeconds);
    this._physics?.evaluate(this._model, deltaTimeSeconds);
    this._model.update();
  }

  draw(canvasWidth: number, canvasHeight: number): void {
    if (this.disposed || !this.ready || !this._model || !this.areShadersReady()) return;

    const projection = new CubismMatrix44();
    if (this._model.getCanvasWidth() > 1.0 && canvasWidth < canvasHeight) {
      this._modelMatrix.setWidth(2.0);
      projection.scale(1.0, canvasWidth / canvasHeight);
    } else {
      projection.scale(canvasHeight / canvasWidth, 1.0);
    }

    projection.multiplyByMatrix(this._modelMatrix);
    this.getRenderer().setMvpMatrix(projection);
    this.getRenderer().setRenderState(null as unknown as WebGLFramebuffer, [0, 0, canvasWidth, canvasHeight]);
    this.getRenderer().drawModel(SHADER_PATH);
  }

  startMotion(group: string, index = 0, priority = PRIORITY_NORMAL): CubismMotionQueueEntryHandle {
    const motion = this.motions.get(`${group}_${index}`);
    if (!motion) {
      console.warn(`[Live2DRenderer] Motion not found: ${group}_${index}`);
      return InvalidMotionQueueEntryHandleValue;
    }

    if (priority === PRIORITY_FORCE) {
      this._motionManager.setReservePriority(priority);
    } else if (!this._motionManager.reserveMotion(priority)) {
      return InvalidMotionQueueEntryHandleValue;
    }

    return this._motionManager.startMotionPriority(motion, false, priority);
  }

  setExpressionByName(name: string): void {
    const expression = this.expressions.get(name);
    if (!expression) {
      console.warn(`[Live2DRenderer] Expression not found: ${name}`);
      return;
    }
    this._expressionManager.startMotion(expression, false);
  }

  resetExpression(): void {
    this._expressionManager.stopAllMotions();
  }

  setPointer(clientX: number, clientY: number, canvasWidth: number, canvasHeight: number): void {
    const x = Math.max(-1, Math.min(1, (clientX / canvasWidth) * 2 - 1));
    const y = Math.max(-1, Math.min(1, -((clientY / canvasHeight) * 2 - 1)));
    this.setDragging(x, y);
  }

  override release(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.ready = false;

    for (const motion of this.motions.values()) {
      ACubismMotion.delete(motion);
    }
    for (const expression of this.expressions.values()) {
      ACubismMotion.delete(expression);
    }
    for (const texture of this.textures) {
      this.gl.deleteTexture(texture);
    }
    if (this.breath) CubismBreath.delete(this.breath);
    this.motions.clear();
    this.expressions.clear();
    this.textures = [];
    this.breath = null;
    this.ready = false;
    super.release();
  }

  private async loadExpressions(): Promise<void> {
    const count = this.setting?.getExpressionCount() ?? 0;
    const tasks = Array.from({ length: count }, async (_, index) => {
      const name = this.setting!.getExpressionName(index);
      const fileName = this.setting!.getExpressionFileName(index);
      const buffer = await fetchArrayBuffer(this.homeDir + fileName);
      const expression = this.loadExpression(buffer, buffer.byteLength, name);
      if (expression) this.expressions.set(name, expression);
    });

    await Promise.all(tasks);
  }

  private async loadPhysicsFile(): Promise<void> {
    const fileName = this.setting?.getPhysicsFileName() ?? '';
    if (!fileName) return;

    const buffer = await fetchArrayBuffer(this.homeDir + fileName);
    this.loadPhysics(buffer, buffer.byteLength);
  }

  private loadEffectIds(): void {
    const eyeBlinkCount = this.setting?.getEyeBlinkParameterCount() ?? 0;
    this.eyeBlinkIds = Array.from({ length: eyeBlinkCount }, (_, index) => this.setting!.getEyeBlinkParameterId(index));

    const lipSyncCount = this.setting?.getLipSyncParameterCount() ?? 0;
    this.lipSyncIds = Array.from({ length: lipSyncCount }, (_, index) => this.setting!.getLipSyncParameterId(index));
  }

  private async loadMotions(): Promise<void> {
    const groupCount = this.setting?.getMotionGroupCount() ?? 0;
    const tasks: Promise<void>[] = [];

    for (let groupIndex = 0; groupIndex < groupCount; groupIndex += 1) {
      const group = this.setting!.getMotionGroupName(groupIndex);
      const motionCount = this.setting!.getMotionCount(group);

      for (let motionIndex = 0; motionIndex < motionCount; motionIndex += 1) {
        tasks.push(this.loadMotionFile(group, motionIndex));
      }
    }

    await Promise.all(tasks);
  }

  private async loadMotionFile(group: string, index: number): Promise<void> {
    const fileName = this.setting!.getMotionFileName(group, index);
    const buffer = await fetchArrayBuffer(this.homeDir + fileName);
    const name = `${group}_${index}`;
    const motion = this.loadMotion(
      buffer,
      buffer.byteLength,
      name,
      undefined,
      undefined,
      this.setting!,
      group,
      index,
      this._motionConsistency,
    );

    if (motion) this.motions.set(name, motion);
    motion?.setEffectIds(this.eyeBlinkIds, this.lipSyncIds);
  }

  private async loadTextures(): Promise<void> {
    const count = this.setting?.getTextureCount() ?? 0;

    for (let index = 0; index < count; index += 1) {
      const fileName = this.setting!.getTextureFileName(index);
      if (!fileName) continue;

      const image = await loadImage(this.homeDir + fileName);
      const texture = createTexture(this.gl, image);
      this.textures.push(texture);
      this.getRenderer().bindTexture(index, texture);
    }
  }

  private async waitForShaders(): Promise<void> {
    const timeoutAt = performance.now() + 5000;

    while (!this.areShadersReady()) {
      if (this.disposed) return;
      if (performance.now() > timeoutAt) {
        throw new Error('Timed out waiting for Cubism WebGL shaders to initialize');
      }
      await waitFrame();
    }
  }

  private areShadersReady(): boolean {
    const shader = CubismShaderManager_WebGL.getInstance().getShader(this.gl);
    return Boolean(
      shader &&
      !shader._isShaderLoading &&
      shader._isShaderLoaded &&
      shader._shaderSets &&
      shader._shaderSets.length > 0,
    );
  }

  private setupLayout(): void {
    const layout = new Map<string, number>();
    this.setting?.getLayoutMap(layout);
    this._modelMatrix.setupFromLayout(layout);
  }

  private setupBreath(): void {
    const idManager = CubismFramework.getIdManager();
    this.breath = CubismBreath.create();
    this.breath.setParameters([
      new BreathParameterData(idManager.getId(CubismDefaultParameterId.ParamAngleX), 0.0, 15.0, 6.5345, 0.35),
      new BreathParameterData(idManager.getId(CubismDefaultParameterId.ParamAngleY), 0.0, 8.0, 3.5345, 0.35),
      new BreathParameterData(idManager.getId(CubismDefaultParameterId.ParamAngleZ), 0.0, 10.0, 5.5345, 0.35),
      new BreathParameterData(idManager.getId(CubismDefaultParameterId.ParamBodyAngleX), 0.0, 4.0, 15.5345, 0.35),
      new BreathParameterData(idManager.getId(CubismDefaultParameterId.ParamBreath), 0.5, 0.5, 3.2345, 1),
    ]);
  }

  private applyPointerLook(): void {
    const idManager = CubismFramework.getIdManager();
    const x = this._dragManager.getX();
    const y = this._dragManager.getY();

    this._model.addParameterValueById(idManager.getId(CubismDefaultParameterId.ParamAngleX), x * 30);
    this._model.addParameterValueById(idManager.getId(CubismDefaultParameterId.ParamAngleY), y * 30);
    this._model.addParameterValueById(idManager.getId(CubismDefaultParameterId.ParamAngleZ), x * y * -30);
    this._model.addParameterValueById(idManager.getId(CubismDefaultParameterId.ParamBodyAngleX), x * 10);
    this._model.addParameterValueById(idManager.getId(CubismDefaultParameterId.ParamEyeBallX), x);
    this._model.addParameterValueById(idManager.getId(CubismDefaultParameterId.ParamEyeBallY), y);
  }
}

/**
 * Official Cubism SDK renderer with the old PetRenderer-facing API.
 */
export class Live2DRenderer implements PetRenderer {
  private canvas: HTMLCanvasElement | null = null;
  private gl: WebGLRenderingContext | null = null;
  private model: OfficialCubismModel | null = null;
  private animationFrame: number | null = null;
  private isInitialized = false;
  private canvasWidth = DEFAULT_CANVAS_WIDTH;
  private canvasHeight = DEFAULT_CANVAS_HEIGHT;
  private currentModelConfig: ModelConfig | null = null;
  private expressionResetTimer: number | null = null;
  private loadVersion = 0;
  private lastFrameTime = 0;
  private disposed = false;

  get view(): HTMLCanvasElement | null {
    return this.canvas;
  }

  get initialized(): boolean {
    return this.isInitialized;
  }

  async loadModel(modelConfig: ModelConfig): Promise<void> {
    const version = ++this.loadVersion;
    this.disposed = false;
    this.currentModelConfig = modelConfig;
    this.applyModelConfig(modelConfig);
    this.stopAnimation();
    this.releaseModel();

    ensureCubismFramework();
    this.createCanvas();

    if (!this.gl) {
      throw new Error('WebGL is not available');
    }

    const model = new OfficialCubismModel(this.gl);
    const finalPath = toModelUrl(modelConfig.path);
    console.log('[Live2DRenderer] Loading official Cubism model from:', finalPath);
    await model.load(finalPath, this.canvas!.width, this.canvas!.height);

    if (this.disposed || version !== this.loadVersion) {
      model.release();
      return;
    }

    this.model = model;
    this.isInitialized = true;
    this.startAnimation();
    console.log('[Live2DRenderer] Official Cubism model loaded successfully');
  }

  async playAction(actionName: string): Promise<void> {
    const action = this.currentModelConfig?.actions?.[actionName] ?? this.getDefaultAction(actionName);
    if (!action) return;
    await this.playConfiguredAction(action);
  }

  async playMotion(group: string, index = 0): Promise<void> {
    this.model?.startMotion(group, index, PRIORITY_FORCE);
  }

  async setExpression(name: string): Promise<void> {
    this.model?.setExpressionByName(name);
  }

  resetExpression(): void {
    this.model?.resetExpression();
  }

  async speak(_text: string): Promise<void> {
    await this.playMotion('Talk', 0);
  }

  lookAt(x: number, y: number): void {
    this.model?.setPointer(x, y, this.canvas?.width ?? this.canvasWidth, this.canvas?.height ?? this.canvasHeight);
  }

  idle(): void {
    this.model?.startMotion('Idle', 0, PRIORITY_IDLE);
  }

  async switchModel(modelConfig: ModelConfig, _fallbackIndex = 0): Promise<void> {
    await this.loadModel(modelConfig);
  }

  hitTestClientPoint(clientX: number, clientY: number, alphaThreshold = 18): boolean {
    if (!this.canvas || !this.gl) return false;

    const rect = this.canvas.getBoundingClientRect();
    if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) {
      return false;
    }

    const pixelX = Math.floor(((clientX - rect.left) / rect.width) * this.canvas.width);
    const pixelY = Math.floor(((clientY - rect.top) / rect.height) * this.canvas.height);
    const pixels = new Uint8Array(4);

    try {
      this.gl.readPixels(pixelX, this.canvas.height - pixelY - 1, 1, 1, this.gl.RGBA, this.gl.UNSIGNED_BYTE, pixels);
      return pixels[3] >= alphaThreshold;
    } catch {
      return true;
    }
  }

  destroy(): void {
    this.disposed = true;
    this.loadVersion += 1;
    if (this.expressionResetTimer) {
      window.clearTimeout(this.expressionResetTimer);
      this.expressionResetTimer = null;
    }
    this.stopAnimation();
    this.releaseModel();
    this.canvas = null;
    this.gl = null;
    this.isInitialized = false;
  }

  private applyModelConfig(modelConfig: ModelConfig): void {
    const canvasSize = getModelCanvasSize(modelConfig);
    const dpr = window.devicePixelRatio || 1;
    this.canvasWidth = Math.round(canvasSize.width * dpr);
    this.canvasHeight = Math.round(canvasSize.height * dpr);
  }

  private createCanvas(): void {
    if (!this.canvas) {
      this.canvas = document.createElement('canvas');
    }

    this.canvas.width = this.canvasWidth;
    this.canvas.height = this.canvasHeight;
    this.canvas.style.width = `${this.canvasWidth / (window.devicePixelRatio || 1)}px`;
    this.canvas.style.height = `${this.canvasHeight / (window.devicePixelRatio || 1)}px`;

    this.gl = this.canvas.getContext('webgl', {
      alpha: true,
      antialias: true,
      premultipliedAlpha: true,
      preserveDrawingBuffer: true,
      stencil: true,
    });
  }

  private startAnimation(): void {
    this.lastFrameTime = performance.now();

    const animate = (time: number) => {
      if (this.disposed || !this.gl || !this.canvas || !this.model) return;

      try {
        const deltaSeconds = Math.min(0.064, Math.max(0.001, (time - this.lastFrameTime) / 1000));
        this.lastFrameTime = time;

        this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        this.gl.clearColor(0, 0, 0, 0);
        this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT | this.gl.STENCIL_BUFFER_BIT);
        this.gl.enable(this.gl.BLEND);
        this.gl.blendFunc(this.gl.ONE, this.gl.ONE_MINUS_SRC_ALPHA);

        this.model.update(deltaSeconds);
        this.model.draw(this.canvas.width, this.canvas.height);
      } catch (err) {
        console.error('[Live2DRenderer] Animation frame failed:', err instanceof Error ? err.stack : err);
        this.stopAnimation();
        return;
      }

      if (!this.disposed) {
        this.animationFrame = requestAnimationFrame(animate);
      }
    };

    this.animationFrame = requestAnimationFrame(animate);
  }

  private stopAnimation(): void {
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
  }

  private releaseModel(): void {
    if (this.model) {
      this.model.release();
      this.model = null;
    }
  }

  private async playConfiguredAction(action: ModelActionConfig): Promise<void> {
    if (this.expressionResetTimer) {
      window.clearTimeout(this.expressionResetTimer);
      this.expressionResetTimer = null;
    }

    if (action.motion) {
      await this.playMotion(action.motion.group, action.motion.index ?? 0);
    }

    if (action.expression) {
      await this.setExpression(action.expression);
    }

    if (action.resetExpressionAfterMs) {
      this.expressionResetTimer = window.setTimeout(() => {
        this.resetExpression();
        this.expressionResetTimer = null;
      }, action.resetExpressionAfterMs);
    }
  }

  private getDefaultAction(actionName: string): ModelActionConfig | undefined {
    const defaults: Record<string, ModelActionConfig> = {
      idle: { motion: { group: 'Idle', index: 0 } },
      thinking: { expression: 'StarEyes' },
      speaking: { expression: 'Blush' },
      happy: { expression: 'HeartEyes' },
      success: { expression: 'HeartEyes' },
      error: { expression: 'DarkFace' },
      confused: { expression: 'WhiteEyes' },
      angry: { expression: 'Angry' },
    };

    return defaults[actionName];
  }
}
