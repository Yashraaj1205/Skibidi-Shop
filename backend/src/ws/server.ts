import { WebSocketServer, WebSocket } from 'ws';
import { Server, IncomingMessage } from 'http';
import { dbEvents } from '../db/listener';
import { OrderEvent } from '../types';
import { auth } from '../config/firebase';
import { isAdminEmail } from '../middleware/auth';
import { pool } from '../db/pool';

interface ClientContext {
  isAdmin: boolean;
  userId: number | null;
}

const contexts = new WeakMap<WebSocket, ClientContext>();

function extractToken(req: IncomingMessage): string | null {
  const header = req.headers['authorization'];
  if (typeof header === 'string' && header.startsWith('Bearer ')) return header.slice(7);

  const url = new URL(req.url || '/', 'http://localhost');
  return url.searchParams.get('token');
}

async function buildContext(req: IncomingMessage): Promise<ClientContext> {
  const token = extractToken(req);
  if (!token) throw new Error('missing token');

  const decoded = await auth.verifyIdToken(token);
  const result = await pool.query('SELECT id FROM users WHERE firebase_uid = $1', [decoded.uid]);

  return {
    isAdmin: isAdminEmail(decoded.email),
    userId: result.rowCount ? result.rows[0].id : null
  };
}

function canSee(ctx: ClientContext, event: OrderEvent): boolean {
  if (ctx.isAdmin) return true;
  return ctx.userId !== null && event.data.user_id === ctx.userId;
}

export function createWebSocketServer(httpServer: Server): WebSocketServer {
  const wss = new WebSocketServer({ server: httpServer });

  wss.on('connection', async (ws: WebSocket, req: IncomingMessage) => {
    let isAlive = true;
    ws.on('pong', () => { isAlive = true; });

    const ping = setInterval(() => {
      if (!isAlive) return ws.terminate();
      isAlive = false;
      ws.ping();
    }, 30_000);

    ws.on('close', () => clearInterval(ping));
    ws.on('error', console.error);

    try {
      contexts.set(ws, await buildContext(req));
    } catch {
      clearInterval(ping);
      ws.close(1008, 'Unauthorized');
    }
  });

  dbEvents.on('order_change', (event: OrderEvent) => {
    const msg = JSON.stringify({ type: 'order_change', ...event });
    wss.clients.forEach((client) => {
      const ctx = contexts.get(client);
      if (client.readyState === WebSocket.OPEN && ctx && canSee(ctx, event)) client.send(msg);
    });
  });

  return wss;
}
