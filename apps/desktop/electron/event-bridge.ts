/**
 * Minimal HTTP event bridge.
 * Listens for POST /event and forwards normalized payloads to the renderer.
 */

import { BrowserWindow } from 'electron';
import { createServer, IncomingMessage, Server, ServerResponse } from 'http';
import log from 'electron-log';
import { IndexedModelAction } from './action-index';

const DEFAULT_BRIDGE_PORT = 18765;

let bridgeServer: Server | null = null;

interface BridgePayload {
  type?: string;
  event?: string;
  data?: unknown;
  text?: string;
  message?: string;
  tool?: string;
  error?: string;
  summary?: string;
}

function readJson(req: IncomingMessage): Promise<BridgePayload> {
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
      try { resolve(JSON.parse(body) as BridgePayload); }
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

function sendRendererEvent(getWindow: () => BrowserWindow | null, eventName: string, data: unknown): void {
  const win = getWindow();
  if (win && !win.isDestroyed()) {
    win.webContents.send('pet:action', eventName, data);
  }
  log.info(`[EventBridge] ${eventName}`, data);
}

function normalizePayload(payload: BridgePayload): { eventName: string; data: unknown } {
  const eventName = payload.type || payload.event || 'idle';
  const { type: _type, event: _event, data, ...rest } = payload;
  return { eventName, data: data ?? rest };
}

export function startEventBridge(
  getWindow: () => BrowserWindow | null,
  getCurrentActions: () => { modelId: string; actions: IndexedModelAction[] },
): void {
  if (bridgeServer) return;

  const port = Number(process.env.VIVIPET_BRIDGE_PORT || DEFAULT_BRIDGE_PORT);

  bridgeServer = createServer(async (req, res) => {
    if (req.method === 'OPTIONS') {
      sendJson(res, 204, {});
      return;
    }

    if (req.method === 'GET' && req.url === '/health') {
      sendJson(res, 200, { status: 'ok', service: 'vivipet-bridge' });
      return;
    }

    if (req.method === 'GET' && req.url === '/actions') {
      const { modelId, actions } = getCurrentActions();
      sendJson(res, 200, {
        ok: true,
        modelId,
        actions: actions.map((action) => action.name),
      });
      return;
    }

    if (req.method === 'POST' && req.url === '/event') {
      try {
        const payload = await readJson(req);
        const { eventName, data } = normalizePayload(payload);
        sendRendererEvent(getWindow, eventName, data);
        sendJson(res, 200, { ok: true, event: eventName });
      } catch (err) {
        sendJson(res, 400, { ok: false, error: err instanceof Error ? err.message : 'Invalid event payload' });
      }
      return;
    }

    sendJson(res, 404, { ok: false, error: 'Not found' });
  });

  bridgeServer.listen(port, '127.0.0.1', () => {
    log.info(`ViviPet event bridge listening on http://127.0.0.1:${port}`);
  });

  bridgeServer.on('error', (err) => {
    log.error('[EventBridge] Failed:', err);
  });
}
