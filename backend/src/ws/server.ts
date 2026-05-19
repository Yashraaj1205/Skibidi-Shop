import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import { dbEvents } from '../db/listener';
import { OrderEvent } from '../types';

export function createWebSocketServer(httpServer: Server): WebSocketServer {
  const wss = new WebSocketServer({ server: httpServer });

  wss.on('connection', (ws: WebSocket) => {
    let isAlive = true;
    ws.on('pong', () => { isAlive = true; });

    const ping = setInterval(() => {
      if (!isAlive) return ws.terminate();
      isAlive = false;
      ws.ping();
    }, 30_000);

    ws.on('close', () => clearInterval(ping));
    ws.on('error', console.error);
  });

  dbEvents.on('order_change', (event: OrderEvent) => {
    const msg = JSON.stringify({ type: 'order_change', ...event });
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) client.send(msg);
    });
  });

  return wss;
}
