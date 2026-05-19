import { Client } from 'pg';
import { EventEmitter } from 'events';
import { OrderEvent } from '../types';
import { sendOrderConfirmationEmail, sendOrderStatusUpdateEmail } from '../services/email';

export const dbEvents = new EventEmitter();

export async function startDBListener(): Promise<void> {
  const client = new Client(
    process.env.DATABASE_URL 
      ? { connectionString: process.env.DATABASE_URL }
      : {
          host:     process.env.DB_HOST || '127.0.0.1',
          port:     Number(process.env.DB_PORT) || 5433,
          database: process.env.DB_NAME || 'apt_orders',
          user:     process.env.DB_USER || 'apt_user',
          password: process.env.DB_PASSWORD || 'apt_pass',
        }
  );

  await client.connect();
  await client.query('LISTEN orders_channel');
  console.log('Listening on orders_channel');

  client.on('notification', (msg) => {
    if (!msg.payload) return;
    try {
      const event: OrderEvent = JSON.parse(msg.payload);

      if (event.data.customer_email) {
        if (event.operation === 'INSERT') {
          sendOrderConfirmationEmail(event.data.customer_email, event.data).catch(console.error);
        } else if (event.operation === 'UPDATE') {
          sendOrderStatusUpdateEmail(event.data.customer_email, event.data).catch(console.error);
        }
      }

      dbEvents.emit('order_change', event);
    } catch (err) {
      console.error('Failed to parse notification:', err);
    }
  });

  client.on('error', (err) => {
    console.error('DB listener error:', err);
  });
}