export interface WebGLContextOptions {
  alpha?: boolean;
  antialias?: boolean;
  premultipliedAlpha?: boolean;
  preserveDrawingBuffer?: boolean;
  stencil?: boolean;
}

const DEFAULT_GL_OPTIONS: WebGLContextOptions = {
  alpha: true,
  antialias: true,
  premultipliedAlpha: true,
  preserveDrawingBuffer: true,
  stencil: true,
};

export function createWebGLContext(
  canvas: HTMLCanvasElement,
  options?: WebGLContextOptions
): WebGLRenderingContext | null {
  const opts = { ...DEFAULT_GL_OPTIONS, ...options };
  const gl = canvas.getContext('webgl', opts) as WebGLRenderingContext | null;
  if (!gl) {
    console.error('[Cubism] Failed to create WebGL context');
    return null;
  }
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.clearColor(0, 0, 0, 0);
  console.log('[Cubism] WebGL context created');
  return gl;
}
