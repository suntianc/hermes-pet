import { BrowserWindow } from 'electron';
import { createServer, IncomingMessage, request as httpRequest, Server, ServerResponse } from 'http';
import { request as httpsRequest } from 'https';
import log from 'electron-log';

const DEFAULT_BRIDGE_PORT = 18765;
const DEFAULT_UPSTREAM_URL = 'http://127.0.0.1:8642';
const MAX_PROXY_BODY_BYTES = 10 * 1024 * 1024;

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
      if (!body.trim()) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body) as BridgePayload);
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function readRawBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;

    req.on('data', (chunk: Buffer | string) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += buffer.length;
      if (total > MAX_PROXY_BODY_BYTES) {
        reject(new Error('Request body too large'));
        req.destroy();
        return;
      }
      chunks.push(buffer);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
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
    win.webContents.send('hermes:event', eventName, data);
  }

  log.info(`[EventBridge] ${eventName}`, data);
}

function normalizePayload(payload: BridgePayload): { eventName: string; data: unknown } {
  const gatewayEvent = normalizeGatewayEvent(payload);
  if (gatewayEvent) return gatewayEvent;

  const eventName = payload.type || payload.event || 'idle';
  const { type: _type, event: _event, data, ...rest } = payload;
  return {
    eventName,
    data: data ?? rest,
  };
}

function normalizeGatewayEvent(payload: any, sseEventName?: string): { eventName: string; data: unknown } | null {
  const event = String(sseEventName || payload?.event || payload?.type || '');
  const chatDelta = payload?.choices?.[0]?.delta?.content;

  if (typeof chatDelta === 'string' && chatDelta.length > 0) {
    return {
      eventName: 'speaking',
      data: { ...payload, text: chatDelta },
    };
  }

  if (payload?.choices?.[0]?.finish_reason) {
    return {
      eventName: 'task_done',
      data: { ...payload, summary: payload?.choices?.[0]?.finish_reason },
    };
  }

  switch (event) {
    case 'run.started':
    case 'response.created':
    case 'response.in_progress':
      return { eventName: 'thinking', data: payload };
    case 'message.delta':
    case 'response.output_text.delta':
      return {
        eventName: 'speaking',
        data: { ...payload, text: payload.delta || payload.text || '' },
      };
    case 'reasoning.delta':
    case 'thinking.delta':
    case 'compression.started':
      return { eventName: 'thinking', data: payload };
    case 'reasoning.available':
    case 'compression.completed':
      return { eventName: 'idle', data: payload };
    case 'hermes.tool.progress':
    case 'tool.started': {
      const toolName = String(payload.tool || payload.name || payload.tool_name || '').toLowerCase();
      let tool = 'coding';
      if (toolName.includes('search') || toolName.includes('web')) {
        tool = 'searching';
      } else if (toolName.includes('read') || toolName.includes('file')) {
        tool = 'reading';
      } else if (
        toolName.includes('terminal') ||
        toolName.includes('bash') ||
        toolName.includes('shell') ||
        toolName.includes('command')
      ) {
        tool = 'terminal';
      }
      return { eventName: 'tool_start', data: { ...payload, tool } };
    }
    case 'response.output_item.added': {
      const item = payload.item || payload.output_item || payload;
      if (item?.type === 'function_call') {
        return {
          eventName: 'tool_start',
          data: { ...payload, tool: item.name || payload.name || 'coding' },
        };
      }
      return { eventName: 'thinking', data: payload };
    }
    case 'response.output_item.done': {
      const item = payload.item || payload.output_item || payload;
      if (item?.type === 'function_call_output' || item?.type === 'function_call') {
        return {
          eventName: 'tool_success',
          data: { ...payload, tool: item.name || payload.name || '' },
        };
      }
      return { eventName: 'idle', data: payload };
    }
    case 'response.completed':
      return {
        eventName: 'task_done',
        data: { ...payload, summary: payload.output_text || payload.summary },
      };
    case 'tool.completed':
      return {
        eventName: payload.error === true ? 'tool_error' : 'tool_success',
        data: {
          ...payload,
          tool: payload.tool || payload.name || '',
          error: payload.error === true ? String(payload.error) : undefined,
        },
      };
    case 'run.completed':
      return {
        eventName: 'task_done',
        data: { ...payload, summary: payload.output || payload.summary },
      };
    case 'run.failed':
      return {
        eventName: 'error',
        data: { ...payload, message: payload.error || 'Run failed' },
      };
    case 'response.failed':
      return {
        eventName: 'error',
        data: { ...payload, message: payload.error?.message || payload.error || 'Response failed' },
      };
    default:
      return null;
  }
}

function mirrorSseChunk(getWindow: () => BrowserWindow | null, text: string): void {
  const blocks = text.split(/\n\n/);

  for (const block of blocks) {
    let sseEventName = '';

    for (const line of block.split('\n')) {
      if (line.startsWith('event:')) {
        sseEventName = line.slice(6).trim();
        continue;
      }

      if (!line.startsWith('data:')) continue;

      const raw = line.slice(5).trim();
      if (!raw || raw === '[DONE]') continue;

      try {
        const payload = JSON.parse(raw);
        const normalized = normalizeGatewayEvent(payload, sseEventName);
        if (normalized) {
          sendRendererEvent(getWindow, normalized.eventName, normalized.data);
        }
      } catch {
        // Ignore keep-alive or non-JSON SSE frames.
      }
    }
  }
}

function copyProxyHeaders(source: IncomingMessage): Record<string, string> {
  const headers: Record<string, string> = {};

  for (const [key, value] of Object.entries(source.headers)) {
    const lower = key.toLowerCase();
    if (lower === 'host' || lower === 'connection' || lower === 'content-length') continue;
    if (Array.isArray(value)) {
      headers[key] = value.join(', ');
    } else if (value !== undefined) {
      headers[key] = String(value);
    }
  }

  return headers;
}

async function proxyGatewayRequest(
  req: IncomingMessage,
  res: ServerResponse,
  getWindow: () => BrowserWindow | null,
): Promise<void> {
  const upstream = new URL(process.env.HERMES_PET_UPSTREAM_URL || DEFAULT_UPSTREAM_URL);
  const requestUrl = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);
  const upstreamPath = requestUrl.pathname.replace(/^\/api\/hermes\/v1/, '/v1');
  const upstreamUrl = new URL(upstreamPath + requestUrl.search, upstream);
  const body = req.method === 'GET' || req.method === 'HEAD' ? undefined : await readRawBody(req);
  const client = upstreamUrl.protocol === 'https:' ? httpsRequest : httpRequest;

  const proxyReq = client({
    protocol: upstreamUrl.protocol,
    hostname: upstreamUrl.hostname,
    port: upstreamUrl.port,
    path: `${upstreamUrl.pathname}${upstreamUrl.search}`,
    method: req.method,
    headers: {
      ...copyProxyHeaders(req),
      ...(body ? { 'content-length': String(body.length) } : {}),
    },
  }, (proxyRes) => {
    res.writeHead(proxyRes.statusCode || 502, {
      ...proxyRes.headers,
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'content-type, authorization',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    });

    const contentType = String(proxyRes.headers['content-type'] || '');
    const isSseStream = contentType.includes('text/event-stream');
    let sseBuffer = '';

    proxyRes.on('data', (chunk: Buffer) => {
      res.write(chunk);

      if (isSseStream) {
        sseBuffer += chunk.toString('utf8');
        let eventEnd = sseBuffer.indexOf('\n\n');
        while (eventEnd !== -1) {
          const eventBlock = sseBuffer.slice(0, eventEnd);
          sseBuffer = sseBuffer.slice(eventEnd + 2);
          mirrorSseChunk(getWindow, eventBlock);
          eventEnd = sseBuffer.indexOf('\n\n');
        }
      }
    });

    proxyRes.on('end', () => {
      if (isSseStream && sseBuffer.trim()) {
        mirrorSseChunk(getWindow, sseBuffer);
      }
      res.end();
    });
  });

  proxyReq.on('error', (err) => {
    if (!res.headersSent) {
      sendJson(res, 502, {
        ok: false,
        error: `Gateway proxy error: ${err instanceof Error ? err.message : String(err)}`,
      });
    } else {
      res.end();
    }
  });

  if (body) proxyReq.write(body);
  proxyReq.end();
}

export function startEventBridge(getWindow: () => BrowserWindow | null): void {
  if (bridgeServer) return;

  const port = Number(process.env.HERMES_PET_BRIDGE_PORT || DEFAULT_BRIDGE_PORT);

  bridgeServer = createServer(async (req, res) => {
    if (req.method === 'OPTIONS') {
      sendJson(res, 204, {});
      return;
    }

    const pathname = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`).pathname;

    if (req.method === 'GET' && req.url === '/health') {
      sendJson(res, 200, {
        status: 'ok',
        service: 'hermes-pet-bridge',
        gatewayProxy: '/v1/*',
        upstream: process.env.HERMES_PET_UPSTREAM_URL || DEFAULT_UPSTREAM_URL,
      });
      return;
    }

    if (pathname.startsWith('/v1/') || pathname.startsWith('/api/hermes/v1/')) {
      try {
        await proxyGatewayRequest(req, res, getWindow);
      } catch (err) {
        sendJson(res, 502, {
          ok: false,
          error: err instanceof Error ? err.message : 'Gateway proxy failed',
        });
      }
      return;
    }

    if (req.method === 'POST' && req.url === '/event') {
      try {
        const payload = await readJson(req);
        const { eventName, data } = normalizePayload(payload);
        sendRendererEvent(getWindow, eventName, data);
        sendJson(res, 200, { ok: true, event: eventName });
      } catch (err) {
        sendJson(res, 400, {
          ok: false,
          error: err instanceof Error ? err.message : 'Invalid event payload',
        });
      }
      return;
    }

    sendJson(res, 404, { ok: false, error: 'Not found' });
  });

  bridgeServer.listen(port, '127.0.0.1', () => {
    log.info(`Hermes pet event bridge listening on http://127.0.0.1:${port}`);
  });

  bridgeServer.on('error', (err) => {
    log.error('[EventBridge] Failed:', err);
  });
}

export function stopEventBridge(): void {
  if (!bridgeServer) return;
  bridgeServer.close();
  bridgeServer = null;
}
