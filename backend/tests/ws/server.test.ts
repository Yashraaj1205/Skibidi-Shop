import { EventEmitter } from 'events';
import type { Server } from 'http';
import type { OrderEvent } from '../../src/types';

class FakeWebSocketServer extends EventEmitter {
  static lastOptions: unknown;
  clients = new Set<FakeSocket>();

  constructor(options: unknown) {
    super();
    FakeWebSocketServer.lastOptions = options;
  }
}

class FakeSocket extends EventEmitter {
  ping = jest.fn();
  terminate = jest.fn();
  send = jest.fn();
  readyState = 1;
}

jest.mock('ws', () => ({
  WebSocketServer: FakeWebSocketServer,
  WebSocket: { OPEN: 1 },
}));
jest.mock('nodemailer', () => ({ __esModule: true, default: { createTransport: () => ({ sendMail: jest.fn() }) } }));

import { dbEvents } from '../../src/db/listener';
import { createWebSocketServer } from '../../src/ws/server';

const httpServer = {} as Server;

function connect(wss: FakeWebSocketServer): FakeSocket {
  const socket = new FakeSocket();
  wss.clients.add(socket);
  wss.emit('connection', socket);
  return socket;
}

const event: OrderEvent = {
  operation: 'UPDATE',
  timestamp: '2024-01-01T00:00:00Z',
  data: {
    id: 1,
    customer_name: 'Ada',
    product_name: 'PS5',
    status: 'shipped',
    updated_at: '2024-01-01T00:00:00Z',
  },
};

beforeEach(() => {
  jest.useFakeTimers();
  dbEvents.removeAllListeners('order_change');
});

afterEach(() => {
  jest.useRealTimers();
  dbEvents.removeAllListeners('order_change');
});

describe('createWebSocketServer', () => {
  it('attaches the WebSocket server to the http server', () => {
    const wss = createWebSocketServer(httpServer) as unknown as FakeWebSocketServer;

    expect(FakeWebSocketServer.lastOptions).toEqual({ server: httpServer });
    expect(wss).toBeInstanceOf(FakeWebSocketServer);
  });

  it('broadcasts order_change events to open clients', () => {
    const wss = createWebSocketServer(httpServer) as unknown as FakeWebSocketServer;
    const socket = connect(wss);

    dbEvents.emit('order_change', event);

    expect(socket.send).toHaveBeenCalledWith(JSON.stringify({ type: 'order_change', ...event }));
  });

  it('skips clients that are not open', () => {
    const wss = createWebSocketServer(httpServer) as unknown as FakeWebSocketServer;
    const socket = connect(wss);
    socket.readyState = 3;

    dbEvents.emit('order_change', event);

    expect(socket.send).not.toHaveBeenCalled();
  });

  it('pings clients on the heartbeat interval', () => {
    const wss = createWebSocketServer(httpServer) as unknown as FakeWebSocketServer;
    const socket = connect(wss);

    jest.advanceTimersByTime(30_000);

    expect(socket.ping).toHaveBeenCalledTimes(1);
    expect(socket.terminate).not.toHaveBeenCalled();
  });

  it('keeps a client alive while it responds with pong', () => {
    const wss = createWebSocketServer(httpServer) as unknown as FakeWebSocketServer;
    const socket = connect(wss);

    jest.advanceTimersByTime(30_000);
    socket.emit('pong');
    jest.advanceTimersByTime(30_000);

    expect(socket.ping).toHaveBeenCalledTimes(2);
    expect(socket.terminate).not.toHaveBeenCalled();
  });

  it('terminates a client that misses a pong', () => {
    const wss = createWebSocketServer(httpServer) as unknown as FakeWebSocketServer;
    const socket = connect(wss);

    jest.advanceTimersByTime(60_000);

    expect(socket.ping).toHaveBeenCalledTimes(1);
    expect(socket.terminate).toHaveBeenCalledTimes(1);
  });

  it('stops pinging once the connection closes', () => {
    const wss = createWebSocketServer(httpServer) as unknown as FakeWebSocketServer;
    const socket = connect(wss);

    socket.emit('close');
    jest.advanceTimersByTime(120_000);

    expect(socket.ping).not.toHaveBeenCalled();
    expect(socket.terminate).not.toHaveBeenCalled();
  });

  it('registers an error handler so socket errors do not crash the process', () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const wss = createWebSocketServer(httpServer) as unknown as FakeWebSocketServer;
    const socket = connect(wss);

    expect(() => socket.emit('error', new Error('boom'))).not.toThrow();
    expect(console.error).toHaveBeenCalled();
  });
});
