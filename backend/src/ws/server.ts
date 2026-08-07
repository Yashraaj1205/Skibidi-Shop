import { IncomingMessage, Server } from 'http';
import { WebSocket, WebSocketServer } from 'ws';
import { getAuth } from '../config/firebase';
import { isAdminEmail } from '../lib/roles';
import { pool } from '../db/pool';
import { dbEvents } from '../db/listener';
import { OrderEvent } from '../types';

const HEARTBEAT_MS = 30_000;
const UNAUTHORIZED = 4401;

interface ClientContext {
  user_id: number | null;
  email: string;
  is_admin: boolean;
}

function tokenFrom(req: IncomingMessage): string | null {
  const url = new URL(req.url || '/', 'http://localhost');
  return url.searchParams.get('token');
}

async function identify(req: IncomingMessage): Promise<ClientContext> {
  const token = tokenFrom(req);
  if (!token) throw new Error('Access token required');

  const decoded = await getAuth().verifyIdToken(token);
  const email = decoded.email || '';
  const result = await pool.query('SELECT id FROM users WHERE firebase_uid = $1', [decoded.uid]);

  return {
    user_id: result.rowCount === 0 ? null : result.rows[0].id,
    email,
    is_admin: isAdminEmail(email)
  };
}

function canSee(ctx: ClientContext, event: OrderEvent): boolean {
  if (ctx.is_admin) return true;
  if (ctx.user_id !== null && event.data.user_id === ctx.user_id) return true;
  return ctx.email !== '' && event.data.customer_email === ctx.email;
}

export function createWebSocketServer(httpServer: Server): WebSocketServer {
  const wss = new WebSocketServer({ server: httpServer });
  const contexts = new WeakMap<WebSocket, ClientContext>();

  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    let isAlive = true;
    ws.on('pong', () => { isAlive = true; });

    const ping = setInterval(() => {
      if (!isAlive) return ws.terminate();
      isAlive = false;
      ws.ping();
    }, HEARTBEAT_MS);

    ws.on('close', () => clearInterval(ping));
    ws.on('error', console.error);

    identify(req)
      .then((ctx) => {
        contexts.set(ws, ctx);
        ws.send(JSON.stringify({ type: 'ready', is_admin: ctx.is_admin }));
      })
      .catch(() => ws.close(UNAUTHORIZED, 'Unauthorized'));
  });

  dbEvents.on('order_change', (event: OrderEvent) => {
    const msg = JSON.stringify({ type: 'order_change', ...event });
    wss.clients.forEach((client) => {
      if (client.readyState !== WebSocket.OPEN) return;
      const ctx = contexts.get(client);
      if (ctx && canSee(ctx, event)) client.send(msg);
    });
  });

  return wss;
}
