import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import { dbEvents } from '../db/listener';
import { OrderEvent } from '../types';

export function createWebSocketServer(httpServer: Server): WebSocketServer {
  const wss = new WebSocketServer({ server: httpServer });

  wss.on('error', (err) => {
    console.error('WebSocket server error:', err);
  });

  wss.on('connection', (ws: WebSocket) => {
    let isAlive = true;
    ws.on('pong', () => { isAlive = true; });

    const ping = setInterval(() => {
      if (!isAlive) return ws.terminate();
      isAlive = false;
      ws.ping();
    }, 30_000);

    ws.on('close', () => clearInterval(ping));
    ws.on('error', (err) => {
      console.error('WebSocket client error:', err);
      clearInterval(ping);
    });
  });

  dbEvents.on('order_change', (event: OrderEvent) => {
    let msg: string;
    try {
      msg = JSON.stringify({ type: 'order_change', ...event });
    } catch (err) {
      console.error('Failed to serialize order_change event:', err);
      return;
    }

    wss.clients.forEach((client) => {
      if (client.readyState !== WebSocket.OPEN) return;
      client.send(msg, (err) => {
        if (err) console.error('Failed to broadcast order_change to a client:', err);
      });
    });
  });

  return wss;
}
