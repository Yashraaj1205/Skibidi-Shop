import { PoolClient } from 'pg';
import { pool } from '../db/pool';
import { HttpError } from '../middleware/error';
import { Identity } from './identity';
import { Order, OrderItem } from '../types';

export const FREE_SHIPPING_THRESHOLD_CENTS = 10_000;
export const FLAT_SHIPPING_CENTS = 999;

export interface RequestedItem {
  product_id: number;
  quantity: number;
}

export interface ShippingAddressInput {
  full_name: string;
  line1: string;
  line2?: string | null;
  city: string;
  region?: string;
  postal_code: string;
  country: string;
  phone?: string | null;
}

export interface PlaceOrderInput {
  items: RequestedItem[];
  address?: ShippingAddressInput;
  clear_cart?: boolean;
}

export interface PlacedOrder {
  order: Order;
  items: OrderItem[];
}

interface LockedProduct {
  id: number;
  name: string;
  image_url: string;
  price_cents: number;
  currency: string;
  stock: number;
  seller_id: number;
  commission_bps: number;
  seller_status: string;
}

export function shippingCentsFor(subtotalCents: number): number {
  return subtotalCents >= FREE_SHIPPING_THRESHOLD_CENTS ? 0 : FLAT_SHIPPING_CENTS;
}

export function commissionCentsFor(lineTotalCents: number, commissionBps: number): number {
  return Math.round((lineTotalCents * commissionBps) / 10_000);
}

function summarize(items: { product_name: string }[]): string {
  const [first, ...rest] = items;
  return rest.length === 0 ? first.product_name : `${first.product_name} +${rest.length} more`;
}

async function lockProducts(client: PoolClient, ids: number[]): Promise<Map<number, LockedProduct>> {
  // Deterministic lock order (by id) keeps concurrent checkouts from deadlocking.
  const result = await client.query(
    `SELECT p.id, p.name, p.image_url, p.price_cents, p.currency, p.stock,
            s.id AS seller_id, s.commission_bps, s.status AS seller_status
       FROM products p
       JOIN sellers s ON s.id = p.seller_id
      WHERE p.id = ANY($1::int[]) AND p.status = 'active'
      ORDER BY p.id
      FOR UPDATE OF p`,
    [ids]
  );
  return new Map(result.rows.map((row: LockedProduct) => [row.id, row]));
}

async function insertShippingAddress(
  client: PoolClient,
  userId: number,
  address: ShippingAddressInput
): Promise<number> {
  const result = await client.query(
    `INSERT INTO addresses (user_id, full_name, line1, line2, city, region, postal_code, country, phone)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
    [
      userId,
      address.full_name,
      address.line1,
      address.line2 || null,
      address.city,
      address.region || '',
      address.postal_code,
      address.country,
      address.phone || null
    ]
  );
  return result.rows[0].id;
}

export async function placeOrder(
  identity: Identity,
  input: PlaceOrderInput
): Promise<PlacedOrder> {
  if (input.items.length === 0) throw new HttpError(400, 'Cart is empty');

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const products = await lockProducts(
      client,
      input.items.map((item) => item.product_id)
    );

    const lines = input.items.map((item) => {
      const product = products.get(item.product_id);
      if (!product) throw new HttpError(404, `Product ${item.product_id} is not available`);
      if (product.seller_status !== 'active') {
        throw new HttpError(409, `${product.name} is temporarily unavailable`);
      }
      if (product.stock < item.quantity) {
        throw new HttpError(409, `Only ${product.stock} left of ${product.name}`);
      }

      const lineTotal = product.price_cents * item.quantity;
      const commission = commissionCentsFor(lineTotal, product.commission_bps);

      return {
        product_id: product.id,
        seller_id: product.seller_id,
        product_name: product.name,
        product_image_url: product.image_url,
        unit_price_cents: product.price_cents,
        quantity: item.quantity,
        commission_bps: product.commission_bps,
        commission_cents: commission,
        seller_earnings_cents: lineTotal - commission,
        line_total_cents: lineTotal,
        currency: product.currency
      };
    });

    const subtotal = lines.reduce((sum, line) => sum + line.line_total_cents, 0);
    const shipping = shippingCentsFor(subtotal);
    const total = subtotal + shipping;
    const currency = lines[0].currency;

    const addressId = input.address
      ? await insertShippingAddress(client, identity.user_id, input.address)
      : null;

    const inserted = await client.query(
      `INSERT INTO orders
         (order_number, customer_name, customer_email, user_id, product_name, status,
          subtotal_cents, shipping_cents, total_cents, currency, shipping_address_id, updated_at)
       VALUES ('provisional-' || MD5(RANDOM()::TEXT || CLOCK_TIMESTAMP()::TEXT), $1, $2, $3, $4, 'pending',
               $5, $6, $7, $8, $9, NOW())
       RETURNING id`,
      [
        input.address?.full_name || identity.display_name,
        identity.email,
        identity.user_id,
        summarize(lines),
        subtotal,
        shipping,
        total,
        currency,
        addressId
      ]
    );
    const orderId = inserted.rows[0].id;

    const finalized = await client.query(
      `UPDATE orders SET order_number = 'SKB-' || LPAD(id::TEXT, 6, '0')
        WHERE id = $1 RETURNING *`,
      [orderId]
    );

    const items: OrderItem[] = [];
    for (const line of lines) {
      const item = await client.query(
        `INSERT INTO order_items
           (order_id, product_id, seller_id, product_name, product_image_url,
            unit_price_cents, quantity, commission_bps, commission_cents, seller_earnings_cents)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
        [
          orderId,
          line.product_id,
          line.seller_id,
          line.product_name,
          line.product_image_url,
          line.unit_price_cents,
          line.quantity,
          line.commission_bps,
          line.commission_cents,
          line.seller_earnings_cents
        ]
      );
      items.push(item.rows[0]);

      await client.query(
        `UPDATE products
            SET stock = stock - $2,
                in_stock = (stock - $2) > 0,
                updated_at = NOW()
          WHERE id = $1`,
        [line.product_id, line.quantity]
      );
    }

    await client.query(
      `INSERT INTO payments (order_id, provider, provider_ref, amount_cents, currency, status)
       VALUES ($1, 'mock', $2, $3, $4, 'captured')`,
      [orderId, `mock_${orderId}`, total, currency]
    );

    await client.query(
      `INSERT INTO order_status_history (order_id, status, note, actor_id)
       VALUES ($1, 'pending', 'Order placed', $2)`,
      [orderId, identity.user_id]
    );

    if (input.clear_cart) {
      await client.query(
        'DELETE FROM cart_items WHERE cart_id IN (SELECT id FROM carts WHERE user_id = $1)',
        [identity.user_id]
      );
    }

    await client.query('COMMIT');
    return { order: finalized.rows[0], items };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}
