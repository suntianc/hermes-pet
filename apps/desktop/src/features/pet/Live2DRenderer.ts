import { CubismDefaultParameterId } from '@framework/cubismdefaultparameterid';
import { CubismModelSettingJson } from '@framework/cubismmodelsettingjson';
import { BreathParameterData, CubismBreath } from '@framework/effect/cubismbreath';
import { ICubismModelSetting } from '@framework/icubismmodelsetting';
import { CubismFramework, LogLevel, Option } from '@framework/live2dcubismframework';
import { CubismMatrix44 } from '@framework/math/cubismmatrix44';
import { CubismTargetPoint } from '@framework/math/cubismtargetpoint';
import { CubismUserModel } from '@framework/model/cubismusermodel';
import { ACubismMotion } from '@framework/motion/acubismmotion';
import { CubismMotion } from '@framework/motion/cubismmotion';
import { CubismMotionQueueEntryHandle, InvalidMotionQueueEntryHandleValue } from '@framework/motion/cubismmotionqueuemanager';
import { CubismShaderManager_WebGL } from '@framework/rendering/cubismshader_webgl';
import { CubismIdHandle } from '@framework/id/cubismid';
import { PetRenderer } from './PetRenderer';
import { PlayActionOptions } from './PetRenderer';
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
  /** 唇形同步：说话振幅 0.0~1.0，0 表示不说话 */
  private speakingAmplitude = 0;
  private disposed = false;
  /** Names of all available motion groups (e.g. ["Idle", "Thinking", ...]) */
  readonly motionGroups: string[] = [];
  /** Names of all available expressions (e.g. ["Blush", "StarEyes", ...]) */
  readonly expressionNames: string[] = [];

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

  async loadConfiguredAssets(actions: Record<string, ModelActionConfig> | undefined): Promise<void> {
    if (!actions) return;

    await Promise.all(Object.entries(actions).map(async ([actionName, action]) => {
      if (action.motion?.file) {
        await this.loadExtraMotion(actionName, action.motion.group, action.motion.index ?? 0, action.motion.file);
      }
      if (action.expression && action.expressionFile && !this.expressions.has(action.expression)) {
        await this.loadExtraExpression(action.expression, action.expressionFile);
      }
    }));
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

    // 唇形同步：说话时驱动 ParamMouthOpenY
    if (this.speakingAmplitude > 0 && this.lipSyncIds.length > 0) {
      for (const id of this.lipSyncIds) {
        const currentValue = this._model.getParameterValueById(id);
        // 在模型原有值基础上叠加动画振幅
        // 使用正弦波 + 随机因子让嘴型自然变化
        const wave = Math.sin(this.userTimeSeconds * 15) * 0.3 + 0.5;
        const target = wave * this.speakingAmplitude * 0.8;
        // 取最大值（不强制覆盖已有的表情动作）
        this._model.setParameterValueById(id, Math.max(currentValue, target), 0.8);
      }
    }

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

  setParameters(params: Record<string, number>): void {
    if (!this._model || !this._initialized) return;
    const idManager = CubismFramework.getIdManager();
    for (const [paramId, value] of Object.entries(params)) {
      this._model.setParameterValueById(idManager.getId(paramId), value, 1);
    }
    this._model.saveParameters();
  }

  resetExpression(): void {
    this._expressionManager.stopAllMotions();
  }

  resetToDefaultParameters(): void {
    this._expressionManager.stopAllMotions();
    this._dragManager = new CubismTargetPoint();
    if (!this._model || !this._initialized) return;

    const count = this._model.getParameterCount();
    for (let i = 0; i < count; i += 1) {
      this._model.setParameterValueByIndex(i, this._model.getParameterDefaultValue(i), 1);
    }
    this._model.saveParameters();
  }

  /** Check if a motion group exists in the loaded model */
  hasMotionGroup(groupName: string): boolean {
    return this.motionGroups.includes(groupName);
  }

  /** Check if an expression exists in the loaded model */
  hasExpression(name: string): boolean {
    return this.expressions.has(name);
  }

  setPointer(clientX: number, clientY: number, canvasWidth: number, canvasHeight: number): void {
    const x = Math.max(-1, Math.min(1, (clientX / canvasWidth) * 2 - 1));
    const y = Math.max(-1, Math.min(1, -((clientY / canvasHeight) * 2 - 1)));
    this.setDragging(x, y);
  }

  /** Reset pointer to center and force pose to default. */
  forceResetPose(): void {
    this._dragManager = new CubismTargetPoint();
    // Directly reset the Cubism parameters affected by drag/pointer.
    // Idle motion doesn't cover ParamAngleX/Y/Z or ParamEyeBallX/Y,
    // so we must set them to 0 directly.
    if (!this._model || !this._initialized) return;
    const id = CubismFramework.getIdManager();
    const params = [
      CubismDefaultParameterId.ParamAngleX,
      CubismDefaultParameterId.ParamAngleY,
      CubismDefaultParameterId.ParamAngleZ,
      CubismDefaultParameterId.ParamBodyAngleX,
      CubismDefaultParameterId.ParamEyeBallX,
      CubismDefaultParameterId.ParamEyeBallY,
    ];
    for (const p of params) {
      this._model.setParameterValueById(id.getId(p), 0, 1);
    }
  }

  /** 设置说话状态（唇形同步） */
  setSpeaking(amplitude: number): void {
    this.speakingAmplitude = Math.max(0, Math.min(1, amplitude));
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
    // Record available expression names for auto-detection
    for (let i = 0; i < count; i++) {
      this.expressionNames.push(this.setting!.getExpressionName(i));
    }

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
      // Record available motion group names for auto-detection
      this.motionGroups.push(group);
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

  private async loadExtraMotion(actionName: string, group: string, index: number, filePath: string): Promise<void> {
    const name = `${group}_${index}`;
    if (this.motions.has(name)) return;

    try {
      const buffer = await fetchArrayBuffer(this.homeDir + filePath);
      const motion = this.loadMotion(
        buffer,
        buffer.byteLength,
        actionName,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        this._motionConsistency,
      );
      if (motion) {
        motion.setEffectIds(this.eyeBlinkIds, this.lipSyncIds);
        this.motions.set(name, motion);
        if (!this.motionGroups.includes(group)) {
          this.motionGroups.push(group);
        }
      }
    } catch (err) {
      console.warn(`[Live2DRenderer] Failed to load extra motion ${filePath}:`, err);
    }
  }

  private async loadExtraExpression(name: string, filePath: string): Promise<void> {
    try {
      const buffer = await fetchArrayBuffer(this.homeDir + filePath);
      const expression = this.loadExpression(buffer, buffer.byteLength, name);
      if (expression) {
        this.expressions.set(name, expression);
        if (!this.expressionNames.includes(name)) {
          this.expressionNames.push(name);
        }
      }
    } catch (err) {
      console.warn(`[Live2DRenderer] Failed to load extra expression ${filePath}:`, err);
    }
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
  private lastActionName: string | null = null;
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
    await model.loadConfiguredAssets(modelConfig.actions);

    if (this.disposed || version !== this.loadVersion) {
      model.release();
      return;
    }

    this.model = model;
    this.isInitialized = true;
    this.startAnimation();
    console.log('[Live2DRenderer] Official Cubism model loaded successfully');
  }

  /**
   * Play an action by name, resolving motions and expressions in this priority:
   * 1. Manual override from model config (models.json → FALLBACK_MODELS)
   * 2. Auto-detect from loaded model: match motion group name to action name
   * 3. Idle motion + optional expression fallback
   */
  async playAction(actionName: string, options: PlayActionOptions = {}): Promise<void> {
    const playback = options.playback ?? 'restart';
    if (playback === 'hold' && this.lastActionName === actionName) {
      return;
    }

    // Priority 1: Manual override from model config
    const configuredAction = this.currentModelConfig?.actions?.[actionName];
    if (configuredAction) {
      await this.playConfiguredAction(configuredAction, actionName, playback);
      return;
    }

    // Priority 2 & 3: Auto-detect or Idle fallback
    const resolvedAction = this.resolveAction(actionName);
    if (resolvedAction) {
      await this.playConfiguredAction(resolvedAction, actionName, playback);
    }
  }

  async playMotion(group: string, index = 0, options: PlayActionOptions = {}): Promise<void> {
    const priority = options.playback === 'momentary' || options.playback === 'restart'
      ? PRIORITY_FORCE
      : PRIORITY_NORMAL;
    this.model?.startMotion(group, index, priority);
  }

  async setExpression(name: string): Promise<void> {
    this.model?.setExpressionByName(name);
  }

  setParameters(params: Record<string, number>): void {
    this.model?.setParameters(params);
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

  /** Reset pointer (interface requirement) */
  resetPointer(): void {
    this.forceResetPose();
  }

  /** Force reset pose: drag center + all angle parameters to 0. */
  forceResetPose(): void {
    this.model?.forceResetPose();
  }

  /** 设置说话状态，驱动唇形同步动画 */
  setSpeaking(speaking: boolean, amplitude = 0): void {
    if (speaking) {
      this.model?.setSpeaking(amplitude);
    } else {
      this.model?.setSpeaking(0);
    }
  }

  /** Resize the canvas to fill the given dimensions. */
  resize(width: number, height: number): void {
    const dpr = window.devicePixelRatio || 1;
    this.canvasWidth = Math.round(width * dpr);
    this.canvasHeight = Math.round(height * dpr);
    if (this.canvas) {
      this.canvas.width = this.canvasWidth;
      this.canvas.height = this.canvasHeight;
      this.canvas.style.width = `${width}px`;
      this.canvas.style.height = `${height}px`;
    }
  }

  idle(): void {
    this.forceResetPose();
    this.model?.startMotion('Idle', 0, PRIORITY_IDLE);
    this.lastActionName = 'idle';
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

  getOpaqueBoundsClient(alphaThreshold = 18): DOMRect | null {
    if (!this.canvas || !this.gl) return null;

    const width = this.canvas.width;
    const height = this.canvas.height;
    const rect = this.canvas.getBoundingClientRect();
    if (width <= 0 || height <= 0 || rect.width <= 0 || rect.height <= 0) return null;

    const pixels = new Uint8Array(width * height * 4);
    try {
      this.gl.readPixels(0, 0, width, height, this.gl.RGBA, this.gl.UNSIGNED_BYTE, pixels);
    } catch {
      return rect;
    }

    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;
    const stride = Math.max(1, Math.floor(Math.min(width, height) / 300));

    for (let y = 0; y < height; y += stride) {
      for (let x = 0; x < width; x += stride) {
        const alpha = pixels[(y * width + x) * 4 + 3];
        if (alpha < alphaThreshold) continue;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }

    if (maxX < minX || maxY < minY) return null;

    const left = rect.left + (minX / width) * rect.width;
    const right = rect.left + ((maxX + stride) / width) * rect.width;
    const top = rect.top + ((height - maxY - stride) / height) * rect.height;
    const bottom = rect.top + ((height - minY) / height) * rect.height;
    return new DOMRect(
      Math.max(rect.left, left),
      Math.max(rect.top, top),
      Math.min(rect.right, right) - Math.max(rect.left, left),
      Math.min(rect.bottom, bottom) - Math.max(rect.top, top),
    );
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
    this.lastActionName = null;
  }

  private async playConfiguredAction(action: ModelActionConfig, actionName: string, playback: PlayActionOptions['playback']): Promise<void> {
    if (this.expressionResetTimer) {
      window.clearTimeout(this.expressionResetTimer);
      this.expressionResetTimer = null;
    }

    if (action.expression) {
      // Reset pose before each expressive action so the animation starts clean.
      this.forceResetPose();
    } else if (actionName === 'idle' || playback === 'restart') {
      // Non-expression actions such as Idle must clear sticky motion/expression
      // parameters from previous actions before establishing a new baseline.
      this.model?.resetToDefaultParameters();
    }

    if (action.motion) {
      await this.playMotion(action.motion.group, action.motion.index ?? 0, { playback });
    }

    if (action.expression) {
      await this.setExpression(action.expression);
    } else {
      this.resetExpression();
    }

    if (action.resetExpressionAfterMs) {
      this.expressionResetTimer = window.setTimeout(() => {
        this.resetExpression();
        this.expressionResetTimer = null;
      }, action.resetExpressionAfterMs);
    }

    this.lastActionName = actionName;
  }

  /**
   * Resolve an action by auto-detecting the motion group from the loaded model.
   * Expressions are NOT automatically applied — the user wants full animations,
   * not expression-only swaps. When model creators add proper motion groups
   * (Thinking, Speaking, Coding, etc.) to their model3.json, they will be
   * discovered here automatically.
   *
   * Resolution order:
   *   1. Match action name as motion group (capitalized: "thinking" → "Thinking")
   *   2. Fallback to "Idle" group
   */
  private resolveAction(actionName: string): ModelActionConfig | undefined {
    const model = this.model;
    if (!model) return { motion: { group: 'Idle', index: 0 } };

    const capitalized = actionName.charAt(0).toUpperCase() + actionName.slice(1); // "thinking" → "Thinking"
    if (model.hasMotionGroup(capitalized)) {
      return { motion: { group: capitalized, index: 0 } };
    }
    if (model.hasMotionGroup(actionName)) {
      return { motion: { group: actionName, index: 0 } };
    }
    if (model.hasExpression(actionName)) {
      return { expression: actionName };
    }
    if (model.hasMotionGroup('Idle')) {
      return { motion: { group: 'Idle', index: 0 } };
    }

    return undefined;
  }
}
