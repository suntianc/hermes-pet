import { CubismDefaultParameterId } from '@framework/cubismdefaultparameterid';
import { CubismModelSettingJson } from '@framework/cubismmodelsettingjson';
import { ICubismModelSetting } from '@framework/icubismmodelsetting';
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

    this.startLoop();
    this.playAction('idle');
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
    if (speaking && amplitude > 0) {
      const model = this.userModel.getModel();
      try {
        const paramId = CubismFramework.getIdManager().getId(CubismDefaultParameterId.MouthOpenY);
        model.setParameterValueByIndex(model.getParameterIndex(paramId), amplitude);
      } catch { }
    }
  }
  speak(_text: string): Promise<void> { return Promise.resolve(); }
  lookAt(_x: number, _y: number): void {}
  resetPointer(): void {}
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

  private startLoop(): void {
    const loop = () => {
      if (this.disposed) return;
      if (this.userModel) {
        this.userModel.getRenderer().drawModel();
      }
      this.animationId = requestAnimationFrame(loop);
    };
    loop();
  }
}
