import { createRoot } from 'react-dom/client';

// Global error handler – renders errors on the page for debugging
window.addEventListener('error', (e) => {
  const errDiv = document.getElementById('error-display') || (() => {
    const d = document.createElement('pre');
    d.id = 'error-display';
    d.style.cssText = 'position:fixed;top:0;left:0;z-index:9999;color:#f44;background:rgba(0,0,0,.8);font:12px monospace;padding:8px;max-width:100vw;white-space:pre-wrap;word-break:break-all';
    document.body.prepend(d);
    return d;
  })();
  const msg = e.error?.stack || e.message || String(e);
  errDiv.textContent = (errDiv.textContent ? errDiv.textContent + '\n---\n' : '') + msg;
});
window.addEventListener('unhandledrejection', (e) => {
  const msg = e.reason?.stack || e.reason?.message || String(e.reason);
  const errDiv = document.getElementById('error-display');
  if (errDiv) errDiv.textContent = (errDiv.textContent ? errDiv.textContent + '\n---\n' : '') + '[PROMISE] ' + msg;
});

// Tauri IPC bootstrap test — verify frontend can call Rust commands
async function testTauriIPC(): Promise<void> {
  try {
    const { invoke } = await import('@tauri-apps/api/core');

    // Test 1: greet command (defined in commands/mod.rs)
    const greeting = await invoke<string>('greet', { name: 'ViviPet' });
    console.log('[Tauri IPC] greet command OK:', greeting);

    console.log('[Tauri IPC] All bootstrap tests passed');
  } catch (err) {
    console.warn('[Tauri IPC] Bootstrap test failed (expected if not in Tauri):', err);
  }
}

async function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) { resolve(); return; }
    const script = document.createElement('script');
    script.src = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
    document.head.appendChild(script);
  });
}

async function bootstrap(): Promise<void> {
  // Load Live2D Cubism Core WASM
  await loadScript('./live2dcubismcore.min.js');
  console.log('[Cubism] Core WASM loaded');

  await import('./styles.css');
  const { default: App } = await import('./App');

  const container = document.getElementById('root');
  if (container) {
    const root = createRoot(container);
    root.render(<App />);
  }

  // Run IPC test (non-blocking — doesn't prevent app from rendering)
  testTauriIPC();
}

bootstrap().catch((err) => {
  console.error('[main] Failed to bootstrap renderer:', err);
  const event = new ErrorEvent('error', {
    error: err,
    message: err instanceof Error ? err.message : String(err),
  });
  window.dispatchEvent(event);
});
