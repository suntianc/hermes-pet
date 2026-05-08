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

async function bootstrap(): Promise<void> {
  const baseUrl = window.location.href;
  if (baseUrl.startsWith('http')) {
    console.log('[Rive] Using auto WASM (dev mode)');
  }

  await import('./styles.css');
  const { default: App } = await import('./App');

  const container = document.getElementById('root');
  if (container) {
    const root = createRoot(container);
    root.render(<App />);
  }
}

bootstrap().catch((err) => {
  console.error('[main] Failed to bootstrap renderer:', err);
  const event = new ErrorEvent('error', {
    error: err,
    message: err instanceof Error ? err.message : String(err),
  });
  window.dispatchEvent(event);
});
