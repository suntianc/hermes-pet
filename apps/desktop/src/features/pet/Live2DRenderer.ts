import { CubismDefaultParameterId } from '@framework/cubismdefaultparameterid';
import { CubismModelSettingJson } from '@framework/cubismmodelsettingjson';
import { ICubismModelSetting } from '@framework/icubismmodelsetting';
import { CubismBreath, BreathParameterData } from '@framework/effect/cubismbreath';
import { CubismEyeBlink } from '@framework/effect/cubismeyeblink';
import { CubismFramework } from '@framework/live2dcubismframework';
import { CubismMatrix44 } from '@framework/math/cubismmatrix44';
import { CubismUserModel } from '@framework/model/cubismusermodel';
import { ACubismMotion } from '@framework/motion/acubismmotion';
import { CubismMotion } from '@framework/motion/cubismmotion';
import { CubismMotionQueueEntryHandle, InvalidMotionQueueEntryHandleValue } from '@framework/motion/cubismmotionqueuemanager';
import { CubismRenderer_WebGL } from '@framework/rendering/cubismrenderer_webgl';
import { ensureCubismFramework } from '../../lib/cubism/bootstrap';
import { PetRenderer, PlayActionOptions } from './PetRenderer';
import { ModelConfig } from './model-registry';
import { resolveAction, MOMENTARY_ACTIONS } from './live2d-action-map';

const PRIORITY_IDLE = 1;
const PRIORITY_NORMAL = 2;
const PRIORITY_FORCE = 3;
const MOMENTARY_DURATION = 400;

async function fetchArrayBuffer(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to load ${url}: HTTP ${response.status}`);
  return response.arrayBuffer();
}

async function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load: ${url}`));
    img.src = url;
  });
}

function createTexture(gl: WebGLRenderingContext, img: HTMLImageElement): WebGLTexture {
  const t = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 1);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.bindTexture(gl.TEXTURE_2D, null);
  return t;
}

export class Live2DRenderer implements PetRenderer {
  private canvas: HTMLCanvasElement | null = null;
  private gl: WebGLRenderingContext | null = null;
  private modelSetting: ICubismModelSetting | null = null;
  private userModel: CubismUserModel | null = null;
  private currentAction = 'idle';
  private idleTimerId: number | null = null;
  private disposed = false;
  private lastMotionHandle: CubismMotionQueueEntryHandle = InvalidMotionQueueEntryHandleValue;
  private animationId: number | null = null;
  private modelDir = '';

  // TTS 唇形同步 (Plan 02-01)
  private currentAmplitude = 0;
  private targetAmplitude = 0;
  private lastMouthValue = 0;
  private mouthCurrentlyOpen = false;
  private readonly AMPLITUDE_CLAMP = 0.05;
  private readonly AMP_LERP_FACTOR = 0.2;
  private readonly AMP_HYSTERESIS = 0.02;

  // 鼠标跟随 (Plan 02-02)
  private targetLookX = 0;
  private targetLookY = 0;
  private currentLookX = 0;
  private currentLookY = 0;
  private lastLookX = 999;
  private lastLookY = 999;
  private readonly LOOK_LERP_FACTOR = 0.1;

  // 空闲动画 (Plan 02-03)
  private lastFrameTime = 0;

  get view(): HTMLCanvasElement | null {
    return this.canvas;
  }

  async loadModel(modelConfig: ModelConfig): Promise<void> {
    ensureCubismFramework();

    if (this.canvas) this.destroy();

    this.canvas = document.createElement('canvas');
    this.canvas.width = 750;
    this.canvas.height = 700;
    this.canvas.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%';

    const gl = this.canvas.getContext('webgl', {
      alpha: true, premultipliedAlpha: true, antialias: true, stencil: true,
    }) as WebGLRenderingContext | null;
    if (!gl) throw new Error('No WebGL');
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0, 0, 0, 0);
    this.gl = gl;

    const path = modelConfig.path.startsWith('/') || modelConfig.path.startsWith('http')
      ? modelConfig.path : `/${modelConfig.path}`;
    this.modelDir = path.substring(0, path.lastIndexOf('/') + 1);

    const modelJsonPath = path.endsWith('.model3.json') ? path : `${path}model.model3.json`;
    const jsonBuf = await fetchArrayBuffer(modelJsonPath);
    this.modelSetting = new CubismModelSettingJson(jsonBuf, jsonBuf.byteLength);

    const mocFileName = this.modelSetting.getModelFileName();
    const mocBuf = await fetchArrayBuffer(`${this.modelDir}${mocFileName}`);
    const userModel = new CubismUserModel();
    userModel.loadModel(mocBuf);
    this.userModel = userModel;

    const renderer = userModel.getRenderer();
    renderer.initialize(userModel.getModel());
    for (let i = 0; i < this.modelSetting.getTextureCount(); i++) {
      const texFile = this.modelSetting.getTextureFileName(i);
      const img = await loadImage(`${this.modelDir}${texFile}`);
      const tex = createTexture(gl, img);
      renderer.bindTexture(i, tex);
    }

    const cw = userModel.getModel().getCanvasWidth();
    const ch = userModel.getModel().getCanvasHeight();
    const scale = Math.min(this.canvas.width / cw, this.canvas.height / ch);
    const mat = new CubismMatrix44();
    mat.scale(scale, scale);
    renderer.setMvpMatrix(mat);

    // 初始化空闲动画效果 (Plan 02-03): 呼吸 + 眨眼
    this.initializeIdleEffects();

    this.startLoop();
    this.playAction('idle');
  }

  private initializeIdleEffects(): void {
    if (!this.userModel || !this.modelSetting) return;
    const model = this.userModel.getModel();

    // 呼吸: 默认参数 (ParamBodyAngleX, ParamBreath, ParamAngleY)
    const breath = CubismBreath.create();
    const idManager = CubismFramework.getIdManager();
    breath.setParameters([
      new BreathParameterData(idManager.getId(CubismDefaultParameterId.ParamBodyAngleX), 0.0, 0.5, 3.0, 0.5),
      new BreathParameterData(idManager.getId(CubismDefaultParameterId.ParamBreath), 0.0, 0.5, 3.0, 0.5),
      new BreathParameterData(idManager.getId(CubismDefaultParameterId.ParamAngleY), 0.0, 0.25, 3.0, 0.5),
    ]);
    (this.userModel as any)._breath = breath;

    // 眨眼: 从 modelSetting 自动读取眨眼参数
    const eyeBlink = CubismEyeBlink.create(this.modelSetting);
    (this.userModel as any)._eyeBlink = eyeBlink;

    this.lastFrameTime = performance.now();
  }

  async playAction(actionName: string, _options?: PlayActionOptions): Promise<void> {
    if (!this.userModel || !this.modelSetting) return;
    this.currentAction = actionName;
    if (this.idleTimerId !== null) { clearTimeout(this.idleTimerId); this.idleTimerId = null; }

    const resolved = resolveAction(actionName);
    for (const group of resolved.groups) {
      if (this.modelSetting.getMotionCount(group) > 0) {
        await this.playMotion(group, 0);
        break;
      }
    }

    if (MOMENTARY_ACTIONS.has(actionName)) {
      this.idleTimerId = window.setTimeout(() => this.playAction('idle'), MOMENTARY_DURATION);
    }
  }

  async playMotion(group: string, index = 0, _options?: PlayActionOptions): Promise<void> {
    if (!this.userModel || !this.modelSetting || index >= this.modelSetting.getMotionCount(group)) return;

    const motionFile = this.modelSetting.getMotionFileName(group, index);
    const buf = await fetchArrayBuffer(`${this.modelDir}${motionFile}`);
    const motion = CubismMotion.create(buf, buf.byteLength);
    this.lastMotionHandle = (this.userModel as any)._motionManager.startMotionPriority(motion, false, PRIORITY_NORMAL);
  }

  async setExpression(_name: string): Promise<void> {}
  setParameters(_params: Record<string, number>): void {}
  setSpeaking(speaking: boolean, amplitude = 0): void {
    if (!this.userModel) return;
    if (speaking) {
      this.targetAmplitude = amplitude > this.AMPLITUDE_CLAMP
        ? Math.min(amplitude, 1.0)
        : 0;
    } else {
      this.targetAmplitude = 0;
    }
  }
  speak(_text: string): Promise<void> { return Promise.resolve(); }
  lookAt(x: number, y: number): void {
    if (!this.canvas) return;
    this.targetLookX = Math.max(-1, Math.min(1, (x / this.canvas.width) * 2 - 1));
    this.targetLookY = Math.max(-1, Math.min(1, (y / this.canvas.height) * 2 - 1));
  }
  resetPointer(): void {
    this.targetLookX = 0;
    this.targetLookY = 0;
  }
  resize(w: number, h: number): void {
    if (this.canvas) { this.canvas.width = w; this.canvas.height = h; }
  }
  idle(): void { this.playAction('idle'); }

  destroy(): void {
    this.disposed = true;
    if (this.animationId !== null) { cancelAnimationFrame(this.animationId); this.animationId = null; }
    if (this.idleTimerId !== null) { clearTimeout(this.idleTimerId); this.idleTimerId = null; }
    if (this.userModel) {
      try { this.userModel.getRenderer().release(); } catch {}
      this.userModel.release();
    }
    this.userModel = null; this.modelSetting = null; this.gl = null; this.canvas = null;
  }

  /** 每帧更新唇形同步: 振幅平滑 + 迟滞削波 */
  private updateLipSync(): void {
    if (!this.userModel) return;
    // 指数移动平均 (Plan 02-01: lerp factor 0.2)
    this.currentAmplitude += (this.targetAmplitude - this.currentAmplitude) * this.AMP_LERP_FACTOR;

    const model = this.userModel.getModel();
    let paramId: any;
    try {
      paramId = CubismFramework.getIdManager().getId(CubismDefaultParameterId.MouthOpenY);
    } catch { return; }

    // 迟滞削波 (Plan 02-01: 防止在阈值附近快速开关)
    let mouthValue: number;
    if (this.mouthCurrentlyOpen) {
      mouthValue = this.currentAmplitude < this.AMPLITUDE_CLAMP - this.AMP_HYSTERESIS
        ? 0 : this.currentAmplitude;
      this.mouthCurrentlyOpen = mouthValue > 0;
    } else {
      mouthValue = this.currentAmplitude > this.AMPLITUDE_CLAMP
        ? this.currentAmplitude : 0;
      this.mouthCurrentlyOpen = mouthValue > 0;
    }

    if (Math.abs(mouthValue - this.lastMouthValue) > 0.005) {
      try {
        model.setParameterValueById(paramId, mouthValue);
      } catch { }
      this.lastMouthValue = mouthValue;
    }
  }

  /** 每帧更新鼠标跟随: lerp 平滑 + 映射到 ParamAngleX/ParamAngleY */
  private updateMouseFollow(): void {
    if (!this.userModel) return;
    // 指数平滑 (Plan 02-02: lerp factor 0.1)
    this.currentLookX += (this.targetLookX - this.currentLookX) * this.LOOK_LERP_FACTOR;
    this.currentLookY += (this.targetLookY - this.currentLookY) * this.LOOK_LERP_FACTOR;

    const model = this.userModel.getModel();
    const idManager = CubismFramework.getIdManager();

    // 映射: normalized -1..1 → ParamAngleX × 30°, ParamAngleY × 15°
    const angleX = this.currentLookX * 30;
    const angleY = this.currentLookY * 15;

    if (Math.abs(this.currentLookX - this.lastLookX) > 0.001) {
      try {
        model.setParameterValueById(idManager.getId(CubismDefaultParameterId.ParamAngleX), angleX);
      } catch { }
      this.lastLookX = this.currentLookX;
    }
    if (Math.abs(this.currentLookY - this.lastLookY) > 0.001) {
      try {
        model.setParameterValueById(idManager.getId(CubismDefaultParameterId.ParamAngleY), angleY);
      } catch { }
      this.lastLookY = this.currentLookY;
    }
  }

  /** 每帧更新空闲动画效果: 呼吸 + 眨眼 */
  private updateIdleEffects(deltaTimeSec: number): void {
    if (!this.userModel) return;
    const model = this.userModel.getModel();

    // 更新呼吸
    const breath = (this.userModel as any)._breath;
    if (breath) {
      breath.updateParameters(model, deltaTimeSec);
    }

    // 更新眨眼
    const eyeBlink = (this.userModel as any)._eyeBlink;
    if (eyeBlink) {
      eyeBlink.updateParameters(model, deltaTimeSec);
    }
  }

  private startLoop(): void {
    this.lastFrameTime = performance.now();
    const loop = () => {
      if (this.disposed) return;

      // 计算 deltaTime (Plan 02-03: clamp to 0.1s max)
      const now = performance.now();
      let deltaTimeSec = (now - this.lastFrameTime) / 1000;
      deltaTimeSec = Math.min(deltaTimeSec, 0.1);
      this.lastFrameTime = now;

      if (this.userModel) {
        // 顺序: 空闲动画 → 嘴唇同步 → 鼠标跟随 → 绘制
        this.updateIdleEffects(deltaTimeSec);
        this.updateLipSync();
        this.updateMouseFollow();
        this.userModel.getRenderer().drawModel();
      }
      this.animationId = requestAnimationFrame(loop);
    };
    loop();
  }
}
