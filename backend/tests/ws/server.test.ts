import { EventEmitter } from 'events';
import type { IncomingMessage, Server } from 'http';
import type { OrderEvent } from '../../src/types';
import { queryResult } from '../helpers/mockPool';

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
  close = jest.fn();
  readyState = 1;
}

jest.mock('ws', () => ({
  WebSocketServer: FakeWebSocketServer,
  WebSocket: { OPEN: 1 },
}));
jest.mock('nodemailer', () => ({
  __esModule: true,
  default: { createTransport: () => ({ sendMail: jest.fn() }) },
}));

const verifyIdToken = jest.fn();
jest.mock('../../src/config/firebase', () => ({ getAuth: () => ({ verifyIdToken }) }));

const query = jest.fn();
jest.mock('../../src/db/pool', () => ({ pool: { query } }));

import { dbEvents } from '../../src/db/listener';
import { createWebSocketServer } from '../../src/ws/server';

const httpServer = {} as Server;

const flush = async () => {
  for (let i = 0; i < 6; i += 1) await Promise.resolve();
};

function attach(wss: FakeWebSocketServer, url: string): FakeSocket {
  const socket = new FakeSocket();
  wss.clients.add(socket);
  wss.emit('connection', socket, { url } as IncomingMessage);
  return socket;
}

async function connect(wss: FakeWebSocketServer, url = '/?token=shopper-token') {
  const socket = attach(wss, url);
  await flush();
  return socket;
}

const shopperEvent: OrderEvent = {
  operation: 'UPDATE',
  timestamp: '2024-01-01T00:00:00Z',
  data: {
    id: 1,
    user_id: 5,
    customer_name: 'Ada',
    customer_email: 'ada@example.com',
    product_name: 'PS5',
    status: 'shipped',
    updated_at: '2024-01-01T00:00:00Z',
  },
} as OrderEvent;

const otherCustomerEvent: OrderEvent = {
  ...shopperEvent,
  data: { ...shopperEvent.data, id: 2, user_id: 9, customer_email: 'grace@example.com' },
} as OrderEvent;

const serialized = (event: OrderEvent) => JSON.stringify({ type: 'order_change', ...event });

const originalEnv = process.env;

beforeEach(() => {
  process.env = { ...originalEnv, ADMIN_EMAILS: 'owner@example.com' };
  jest.useFakeTimers();
  dbEvents.removeAllListeners('order_change');
  verifyIdToken.mockImplementation(async (token: string) => {
    if (token === 'shopper-token') return { uid: 'uid-shopper', email: 'ada@example.com' };
    if (token === 'admin-token') return { uid: 'uid-admin', email: 'owner@example.com' };
    if (token === 'anonymous-token') return { uid: 'uid-anon' };
    throw new Error('invalid token');
  });
  query.mockImplementation(async (_sql: string, params: unknown[]) =>
    params[0] === 'uid-shopper' ? queryResult([{ id: 5 }]) : queryResult([], 0)
  );
});

afterEach(() => {
  process.env = originalEnv;
  jest.useRealTimers();
  dbEvents.removeAllListeners('order_change');
});

describe('createWebSocketServer', () => {
  it('attaches the WebSocket server to the http server', () => {
    const wss = createWebSocketServer(httpServer) as unknown as FakeWebSocketServer;

    expect(FakeWebSocketServer.lastOptions).toEqual({ server: httpServer });
    expect(wss).toBeInstanceOf(FakeWebSocketServer);
  });
});

describe('connection authentication', () => {
  it('acknowledges an authenticated customer', async () => {
    const wss = createWebSocketServer(httpServer) as unknown as FakeWebSocketServer;

    const socket = await connect(wss);

    expect(verifyIdToken).toHaveBeenCalledWith('shopper-token');
    expect(socket.send).toHaveBeenCalledWith(JSON.stringify({ type: 'ready', is_admin: false }));
    expect(socket.close).not.toHaveBeenCalled();
  });

  it('reports admin status to allowlisted accounts', async () => {
    const wss = createWebSocketServer(httpServer) as unknown as FakeWebSocketServer;

    const socket = await connect(wss, '/?token=admin-token');

    expect(socket.send).toHaveBeenCalledWith(JSON.stringify({ type: 'ready', is_admin: true }));
  });

  it('closes connections that supply no token', async () => {
    const wss = createWebSocketServer(httpServer) as unknown as FakeWebSocketServer;

    const socket = await connect(wss, '/');

    expect(socket.close).toHaveBeenCalledWith(4401, 'Unauthorized');
    expect(verifyIdToken).not.toHaveBeenCalled();
  });

  it('closes connections whose token fails verification', async () => {
    const wss = createWebSocketServer(httpServer) as unknown as FakeWebSocketServer;

    const socket = await connect(wss, '/?token=forged');

    expect(socket.close).toHaveBeenCalledWith(4401, 'Unauthorized');
  });

  it('tolerates a missing request url', async () => {
    const wss = createWebSocketServer(httpServer) as unknown as FakeWebSocketServer;
    const socket = new FakeSocket();
    wss.clients.add(socket);
    wss.emit('connection', socket, {} as IncomingMessage);
    await flush();

    expect(socket.close).toHaveBeenCalledWith(4401, 'Unauthorized');
  });
});

describe('order_change fan-out', () => {
  it('sends a customer only their own orders', async () => {
    const wss = createWebSocketServer(httpServer) as unknown as FakeWebSocketServer;
    const socket = await connect(wss);
    socket.send.mockClear();

    dbEvents.emit('order_change', shopperEvent);
    dbEvents.emit('order_change', otherCustomerEvent);

    expect(socket.send).toHaveBeenCalledTimes(1);
    expect(socket.send).toHaveBeenCalledWith(serialized(shopperEvent));
  });

  it('matches on customer_email when the order has no user_id', async () => {
    const wss = createWebSocketServer(httpServer) as unknown as FakeWebSocketServer;
    const socket = await connect(wss);
    socket.send.mockClear();
    const legacyEvent = {
      ...shopperEvent,
      data: { ...shopperEvent.data, user_id: undefined },
    } as OrderEvent;

    dbEvents.emit('order_change', legacyEvent);

    expect(socket.send).toHaveBeenCalledWith(serialized(legacyEvent));
  });

  it('sends every order to admins', async () => {
    const wss = createWebSocketServer(httpServer) as unknown as FakeWebSocketServer;
    const socket = await connect(wss, '/?token=admin-token');
    socket.send.mockClear();

    dbEvents.emit('order_change', shopperEvent);
    dbEvents.emit('order_change', otherCustomerEvent);

    expect(socket.send).toHaveBeenCalledTimes(2);
  });

  it('sends nothing to a signed-in account with no profile row and no email', async () => {
    const wss = createWebSocketServer(httpServer) as unknown as FakeWebSocketServer;
    const socket = await connect(wss, '/?token=anonymous-token');
    socket.send.mockClear();

    dbEvents.emit('order_change', shopperEvent);

    expect(socket.send).not.toHaveBeenCalled();
  });

  it('sends nothing to a client that has not finished authenticating', () => {
    const wss = createWebSocketServer(httpServer) as unknown as FakeWebSocketServer;
    const socket = attach(wss, '/?token=shopper-token');

    dbEvents.emit('order_change', shopperEvent);

    expect(socket.send).not.toHaveBeenCalled();
  });

  it('skips clients that are not open', async () => {
    const wss = createWebSocketServer(httpServer) as unknown as FakeWebSocketServer;
    const socket = await connect(wss);
    socket.send.mockClear();
    socket.readyState = 3;

    dbEvents.emit('order_change', shopperEvent);

    expect(socket.send).not.toHaveBeenCalled();
  });
});

describe('heartbeat', () => {
  it('pings clients on the heartbeat interval', async () => {
    const wss = createWebSocketServer(httpServer) as unknown as FakeWebSocketServer;
    const socket = await connect(wss);

    jest.advanceTimersByTime(30_000);

    expect(socket.ping).toHaveBeenCalledTimes(1);
    expect(socket.terminate).not.toHaveBeenCalled();
  });

  it('keeps a client alive while it responds with pong', async () => {
    const wss = createWebSocketServer(httpServer) as unknown as FakeWebSocketServer;
    const socket = await connect(wss);

    jest.advanceTimersByTime(30_000);
    socket.emit('pong');
    jest.advanceTimersByTime(30_000);

    expect(socket.ping).toHaveBeenCalledTimes(2);
    expect(socket.terminate).not.toHaveBeenCalled();
  });

  it('terminates a client that misses a pong', async () => {
    const wss = createWebSocketServer(httpServer) as unknown as FakeWebSocketServer;
    const socket = await connect(wss);

    jest.advanceTimersByTime(60_000);

    expect(socket.ping).toHaveBeenCalledTimes(1);
    expect(socket.terminate).toHaveBeenCalledTimes(1);
  });

  it('stops pinging once the connection closes', async () => {
    const wss = createWebSocketServer(httpServer) as unknown as FakeWebSocketServer;
    const socket = await connect(wss);

    socket.emit('close');
    jest.advanceTimersByTime(120_000);

    expect(socket.ping).not.toHaveBeenCalled();
    expect(socket.terminate).not.toHaveBeenCalled();
  });

  it('registers an error handler so socket errors do not crash the process', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const wss = createWebSocketServer(httpServer) as unknown as FakeWebSocketServer;
    const socket = await connect(wss);

    expect(() => socket.emit('error', new Error('boom'))).not.toThrow();
    expect(console.error).toHaveBeenCalled();
  });
});
