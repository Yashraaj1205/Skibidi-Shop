import { EventEmitter } from 'events';
import type { OrderEvent } from '../../src/types';

class FakeClient extends EventEmitter {
  static instances: FakeClient[] = [];
  static lastConfig: unknown;

  connect = jest.fn().mockResolvedValue(undefined);
  query = jest.fn().mockResolvedValue(undefined);

  constructor(config: unknown) {
    super();
    FakeClient.lastConfig = config;
    FakeClient.instances.push(this);
  }
}

jest.mock('pg', () => ({ Client: FakeClient }));

const sendOrderConfirmationEmail = jest.fn().mockResolvedValue(undefined);
const sendOrderStatusUpdateEmail = jest.fn().mockResolvedValue(undefined);
jest.mock('../../src/services/email', () => ({
  sendOrderConfirmationEmail,
  sendOrderStatusUpdateEmail,
}));

import { dbEvents, startDBListener } from '../../src/db/listener';

function event(overrides: Partial<OrderEvent> = {}): OrderEvent {
  return {
    operation: 'INSERT',
    timestamp: '2024-01-01T00:00:00Z',
    data: {
      id: 1,
      customer_name: 'Ada',
      customer_email: 'ada@example.com',
      product_name: 'PS5',
      status: 'pending',
      updated_at: '2024-01-01T00:00:00Z',
    },
    ...overrides,
  };
}

async function start(): Promise<FakeClient> {
  await startDBListener();
  return FakeClient.instances[FakeClient.instances.length - 1];
}

beforeEach(() => {
  FakeClient.instances = [];
  dbEvents.removeAllListeners();
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  dbEvents.removeAllListeners();
});

describe('startDBListener', () => {
  it('connects and subscribes to orders_channel', async () => {
    const client = await start();

    expect(client.connect).toHaveBeenCalled();
    expect(client.query).toHaveBeenCalledWith('LISTEN orders_channel');
  });

  it('prefers DATABASE_URL over discrete connection settings', async () => {
    process.env.DATABASE_URL = 'postgres://user:pass@host:5432/db';
    try {
      await start();
      expect(FakeClient.lastConfig).toEqual({
        connectionString: 'postgres://user:pass@host:5432/db',
      });
    } finally {
      delete process.env.DATABASE_URL;
    }
  });

  it('falls back to discrete connection settings', async () => {
    delete process.env.DATABASE_URL;

    await start();

    expect(FakeClient.lastConfig).toEqual({
      host: '127.0.0.1',
      port: 5433,
      database: 'apt_orders',
      user: 'apt_user',
      password: 'apt_pass',
    });
  });

  it('re-emits notifications as order_change events', async () => {
    const client = await start();
    const listener = jest.fn();
    dbEvents.on('order_change', listener);

    client.emit('notification', { channel: 'orders_channel', payload: JSON.stringify(event()) });

    expect(listener).toHaveBeenCalledWith(event());
  });

  it('sends a confirmation email on INSERT', async () => {
    const client = await start();

    client.emit('notification', { payload: JSON.stringify(event()) });

    expect(sendOrderConfirmationEmail).toHaveBeenCalledWith('ada@example.com', event().data);
    expect(sendOrderStatusUpdateEmail).not.toHaveBeenCalled();
  });

  it('sends a status update email on UPDATE', async () => {
    const client = await start();
    const updated = event({ operation: 'UPDATE' });

    client.emit('notification', { payload: JSON.stringify(updated) });

    expect(sendOrderStatusUpdateEmail).toHaveBeenCalledWith('ada@example.com', updated.data);
    expect(sendOrderConfirmationEmail).not.toHaveBeenCalled();
  });

  it('sends no email on DELETE but still broadcasts', async () => {
    const client = await start();
    const listener = jest.fn();
    dbEvents.on('order_change', listener);
    const deleted = event({ operation: 'DELETE' });

    client.emit('notification', { payload: JSON.stringify(deleted) });

    expect(sendOrderConfirmationEmail).not.toHaveBeenCalled();
    expect(sendOrderStatusUpdateEmail).not.toHaveBeenCalled();
    expect(listener).toHaveBeenCalledWith(deleted);
  });

  it('sends no email when the order has no customer_email', async () => {
    const client = await start();
    const anonymous = event();
    delete anonymous.data.customer_email;

    client.emit('notification', { payload: JSON.stringify(anonymous) });

    expect(sendOrderConfirmationEmail).not.toHaveBeenCalled();
  });

  it('ignores notifications without a payload', async () => {
    const client = await start();
    const listener = jest.fn();
    dbEvents.on('order_change', listener);

    client.emit('notification', {});

    expect(listener).not.toHaveBeenCalled();
  });

  it('logs and swallows malformed payloads', async () => {
    const client = await start();
    const listener = jest.fn();
    dbEvents.on('order_change', listener);

    client.emit('notification', { payload: 'not json' });

    expect(listener).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith('Failed to parse notification:', expect.any(Error));
  });

  it('logs client errors instead of throwing', async () => {
    const client = await start();

    client.emit('error', new Error('connection lost'));

    expect(console.error).toHaveBeenCalledWith('DB listener error:', expect.any(Error));
  });

  it('logs email rejections without failing the notification handler', async () => {
    const client = await start();
    sendOrderConfirmationEmail.mockRejectedValueOnce(new Error('smtp down'));

    client.emit('notification', { payload: JSON.stringify(event()) });
    await Promise.resolve();

    expect(console.error).toHaveBeenCalled();
  });
});
