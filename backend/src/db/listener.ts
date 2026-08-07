import { Client } from 'pg';
import { EventEmitter } from 'events';
import { OrderEvent } from '../types';
import { dbConfig } from './config';
import { sendOrderConfirmationEmail, sendOrderStatusUpdateEmail } from '../services/email';

export const dbEvents = new EventEmitter();

export async function startDBListener(): Promise<void> {
  const client = new Client(dbConfig);

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