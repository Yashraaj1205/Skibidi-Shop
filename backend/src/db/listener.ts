import { Client } from 'pg';
import { EventEmitter } from 'events';
import { OrderEvent } from '../types';
import { sendOrderConfirmationEmail, sendOrderStatusUpdateEmail } from '../services/email';

export const dbEvents = new EventEmitter();

export async function startDBListener(): Promise<void> {
  const client = new Client({
    host:     process.env.DB_HOST || '127.0.0.1',
    port:     Number(process.env.DB_PORT) || 5433,
    database: process.env.DB_NAME || 'apt_orders',
    user:     process.env.DB_USER || 'apt_user',
    password: process.env.DB_PASSWORD || 'apt_pass',
  });

  await client.connect();
  await client.query('LISTEN orders_channel');
  console.log('✓ Listening on PostgreSQL channel: orders_channel');

  client.on('notification', (msg) => {
    if (!msg.payload) return;
    try {
      const event: OrderEvent = JSON.parse(msg.payload);
      
      // Dispatch emails in a non-blocking background fire-and-forget loop
      if (event.data.customer_email) {
        if (event.operation === 'INSERT') {
          sendOrderConfirmationEmail(event.data.customer_email, event.data).catch((err) =>
            console.error('Failed to trigger confirmation email in background:', err)
          );
        } else if (event.operation === 'UPDATE') {
          // Check if status changed by looking at database if needed, or simply send on any update.
          // Since patch is only used for status updates, simple check is perfect.
          sendOrderStatusUpdateEmail(event.data.customer_email, event.data).catch((err) =>
            console.error('Failed to trigger status update email in background:', err)
          );
        }
      }

      dbEvents.emit('order_change', event);
    } catch (err) {
      console.error('Failed to parse notification payload:', err);
    }
  });

  client.on('error', (err) => {
    console.error('DB listener connection error:', err);
  });
}