import { Client, ClientConfig } from 'pg';
import { EventEmitter } from 'events';
import { OrderEvent } from '../types';
import { sendOrderConfirmationEmail, sendOrderStatusUpdateEmail } from '../services/email';

export const dbEvents = new EventEmitter();

const RECONNECT_DELAY_MS = 5_000;

let reconnectTimer: NodeJS.Timeout | null = null;

function clientConfig(): ClientConfig {
  return process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL }
    : {
        host:     process.env.DB_HOST || '127.0.0.1',
        port:     Number(process.env.DB_PORT) || 5433,
        database: process.env.DB_NAME || 'apt_orders',
        user:     process.env.DB_USER || 'apt_user',
        password: process.env.DB_PASSWORD || 'apt_pass',
      };
}

function dispatchEmail(event: OrderEvent): void {
  const email = event.data.customer_email;
  if (!email) return;

  const send =
    event.operation === 'INSERT' ? sendOrderConfirmationEmail :
    event.operation === 'UPDATE' ? sendOrderStatusUpdateEmail :
    null;

  if (!send) return;

  send(email, event.data).catch((err) => {
    console.error(`Failed to send ${event.operation} email for order ${event.data.id}:`, err);
  });
}

function handleNotification(payload: string | undefined): void {
  if (!payload) {
    console.warn('Received notification on orders_channel without a payload');
    return;
  }

  let event: OrderEvent;
  try {
    event = JSON.parse(payload);
  } catch (err) {
    console.error('Failed to parse notification payload:', payload, err);
    return;
  }

  if (!event.operation || !event.data) {
    console.error('Notification payload is missing operation or data:', payload);
    return;
  }

  dispatchEmail(event);

  try {
    dbEvents.emit('order_change', event);
  } catch (err) {
    console.error('An order_change listener threw:', err);
  }
}

function scheduleReconnect(): void {
  if (reconnectTimer) return;

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect().catch((err) => {
      console.error('DB listener reconnect attempt failed:', err);
      scheduleReconnect();
    });
  }, RECONNECT_DELAY_MS);
}

async function connect(): Promise<void> {
  const client = new Client(clientConfig());
  let lost = false;

  const handleConnectionLoss = (reason: string, err?: unknown): void => {
    if (lost) return;
    lost = true;
    console.error(`DB listener ${reason}; retrying in ${RECONNECT_DELAY_MS}ms`, err ?? '');
    client.removeAllListeners();
    client.end().catch(() => undefined);
    scheduleReconnect();
  };

  client.on('error', (err) => handleConnectionLoss('connection error', err));
  client.on('end', () => handleConnectionLoss('connection closed'));
  client.on('notification', (msg) => handleNotification(msg.payload));

  await client.connect();
  await client.query('LISTEN orders_channel');
  console.log('Listening on orders_channel');
}

export async function startDBListener(): Promise<void> {
  await connect();
}
