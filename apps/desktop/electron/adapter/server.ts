import { BrowserWindow } from 'electron';
import { createServer, IncomingMessage, Server, ServerResponse } from 'http';
import log from 'electron-log';
import { ADAPTER_VERSION, AdapterCapabilities } from './protocol';
import { normalizeAgentEvent } from './normalize';
import { toPetStateEvent } from './policy';

const DEFAULT_ADAPTER_PORT = 18765;

let adapterServer: Server | null = null;

function readJson(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1024 * 1024) {
        reject(new Error('Request body too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!body.trim()) { resolve({}); return; }
      try { resolve(JSON.parse(body) as unknown); }
      catch (err) { reject(err); }
    });
    req.on('error', reject);
  });
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  });
  res.end(JSON.stringify(body));
}

function sendRendererPetEvent(getWindow: () => BrowserWindow | null, data: unknown): void {
  const win = getWindow();
  if (win && !win.isDestroyed()) {
    win.webContents.send('pet:event', data);
  }
  log.info('[Adapter] pet:event', data);
}

function capabilities(): AdapterCapabilities {
  return {
    ok: true,
    version: ADAPTER_VERSION,
    service: 'vivipet-adapter',
    capabilities: {
      states: [
        'idle',
        'thinking',
        'speaking',
        'searching',
        'reading',
        'coding',
        'terminal',
        'success',
        'error',
        'happy',
      ],
      phases: [
        'idle',
        'thinking',
        'speaking',
        'tool:start',
        'tool:success',
        'tool:error',
        'task:done',
        'session:start',
        'session:update',
        'session:end',
        'message',
      ],
      speech: true,
      tts: true,
      ttsControl: {
        field: 'tts',
        default: false,
        fallbackToBubble: true,
        acceptedValues: ['boolean', 'options.enabled'],
      },
    },
  };
}

export function startAdapterServer(getWindow: () => BrowserWindow | null): void {
  if (adapterServer) return;

  const port = Number(process.env.VIVIPET_BRIDGE_PORT || process.env.VIVIPET_ADAPTER_PORT || DEFAULT_ADAPTER_PORT);

  adapterServer = createServer(async (req, res) => {
    if (req.method === 'OPTIONS') {
      sendJson(res, 204, {});
      return;
    }

    if (req.method === 'GET' && req.url === '/health') {
      sendJson(res, 200, { status: 'ok', service: 'vivipet-adapter', version: ADAPTER_VERSION });
      return;
    }

    if (req.method === 'GET' && req.url === '/adapter/capabilities') {
      sendJson(res, 200, capabilities());
      return;
    }

    if (req.method === 'POST' && req.url === '/adapter') {
      try {
        const payload = await readJson(req);
        const agentEvent = normalizeAgentEvent(payload);
        const petEvent = toPetStateEvent(agentEvent);
        if (!petEvent) {
          sendJson(res, 400, { ok: false, error: `Unknown adapter phase: ${agentEvent.phase}` });
          return;
        }
        sendRendererPetEvent(getWindow, petEvent);
        sendJson(res, 200, { ok: true, version: ADAPTER_VERSION, event: petEvent });
      } catch (err) {
        sendJson(res, 400, { ok: false, error: err instanceof Error ? err.message : 'Invalid adapter payload' });
      }
      return;
    }

    sendJson(res, 404, { ok: false, error: 'Not found' });
  });

  adapterServer.listen(port, '127.0.0.1', () => {
    log.info(`ViviPet adapter listening on http://127.0.0.1:${port}`);
  });

  adapterServer.on('error', (err) => {
    log.error('[Adapter] Failed:', err);
  });
}
