import { makeIdentity, makeOrder } from '../helpers/fixtures';
import { queryResult } from '../helpers/mockPool';

const clientQuery = jest.fn();
const release = jest.fn();
const connect = jest.fn(() => Promise.resolve({ query: clientQuery, release }));
jest.mock('../../src/db/pool', () => ({ pool: { connect } }));

import {
  commissionCentsFor,
  placeOrder,
  shippingCentsFor
} from '../../src/services/checkout';

const PRODUCT = {
  id: 5,
  name: 'PS5',
  image_url: 'https://img/ps5.png',
  price_cents: 4000,
  currency: 'USD',
  stock: 10,
  seller_id: 2,
  commission_bps: 1000,
  seller_status: 'active'
};

function respond(overrides: { products?: unknown[] } = {}) {
  clientQuery.mockImplementation((text: string) => {
    if (text.includes('FOR UPDATE OF p')) {
      return Promise.resolve(queryResult(overrides.products ?? [PRODUCT]));
    }
    if (text.includes('INSERT INTO addresses')) return Promise.resolve(queryResult([{ id: 77 }]));
    if (text.includes('INSERT INTO orders')) return Promise.resolve(queryResult([{ id: 100 }]));
    if (text.includes('UPDATE orders SET order_number')) {
      return Promise.resolve(queryResult([makeOrder({ id: 100, order_number: 'SKB-000100' })]));
    }
    if (text.includes('INSERT INTO order_items')) {
      return Promise.resolve(queryResult([{ id: 200, quantity: 2 }]));
    }
    return Promise.resolve(queryResult([]));
  });
}

const sql = () => clientQuery.mock.calls.map((call) => String(call[0]));
const callFor = (fragment: string) =>
  clientQuery.mock.calls.find((call) => String(call[0]).includes(fragment));

const identity = makeIdentity();
const address = {
  full_name: 'Ada Lovelace',
  line1: '1 Analytical Way',
  city: 'London',
  postal_code: 'E1 6AN',
  country: 'GB'
};

beforeEach(() => {
  clientQuery.mockReset();
  release.mockClear();
  respond();
});

describe('pricing helpers', () => {
  it('charges flat shipping below the threshold and none above it', () => {
    expect(shippingCentsFor(9_999)).toBe(999);
    expect(shippingCentsFor(10_000)).toBe(0);
  });

  it('rounds commission to the nearest cent', () => {
    expect(commissionCentsFor(4_999, 1_000)).toBe(500);
    expect(commissionCentsFor(333, 1_500)).toBe(50);
  });
});

describe('placeOrder', () => {
  it('rejects an empty basket before opening a transaction', async () => {
    await expect(placeOrder(identity, { items: [] })).rejects.toThrow('Cart is empty');
    expect(connect).not.toHaveBeenCalled();
  });

  it('locks products in id order inside a transaction and commits', async () => {
    await placeOrder(identity, { items: [{ product_id: 5, quantity: 2 }] });

    const statements = sql();
    expect(statements[0]).toBe('BEGIN');
    expect(statements[statements.length - 1]).toBe('COMMIT');
    expect(callFor('FOR UPDATE OF p')![0]).toContain('ORDER BY p.id');
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('prices the order, splits the commission and records payment plus history', async () => {
    const placed = await placeOrder(identity, { items: [{ product_id: 5, quantity: 2 }] });

    expect(callFor('INSERT INTO orders')![1]).toEqual([
      'Ada',
      'ada@example.com',
      7,
      'PS5',
      8000,
      999,
      8999,
      'USD',
      null
    ]);
    expect(callFor('INSERT INTO order_items')![1]).toEqual([
      100,
      5,
      2,
      'PS5',
      'https://img/ps5.png',
      4000,
      2,
      1000,
      800,
      7200
    ]);
    expect(callFor('INSERT INTO payments')![1]).toEqual([100, 'mock_100', 8999, 'USD']);
    expect(callFor('INSERT INTO order_status_history')![1]).toEqual([100, 7]);
    expect(placed.order.order_number).toBe('SKB-000100');
    expect(placed.items).toHaveLength(1);
  });

  it('decrements stock and flips in_stock when the last unit sells', async () => {
    await placeOrder(identity, { items: [{ product_id: 5, quantity: 2 }] });

    const update = callFor('UPDATE products');
    expect(String(update![0])).toContain('in_stock = (stock - $2) > 0');
    expect(update![1]).toEqual([5, 2]);
  });

  it('summarizes multi-item orders in the legacy product_name column', async () => {
    respond({ products: [PRODUCT, { ...PRODUCT, id: 6, name: 'Controller' }] });

    await placeOrder(identity, {
      items: [
        { product_id: 5, quantity: 1 },
        { product_id: 6, quantity: 1 }
      ]
    });

    expect(callFor('INSERT INTO orders')![1]![3]).toBe('PS5 +1 more');
  });

  it('stores the shipping address and uses its name for the order', async () => {
    await placeOrder(identity, { items: [{ product_id: 5, quantity: 1 }], address });

    expect(callFor('INSERT INTO addresses')![1]).toEqual([
      7,
      'Ada Lovelace',
      '1 Analytical Way',
      null,
      'London',
      '',
      'E1 6AN',
      'GB',
      null
    ]);
    const order = callFor('INSERT INTO orders')![1]!;
    expect(order[0]).toBe('Ada Lovelace');
    expect(order[8]).toBe(77);
  });

  it('clears the cart only when asked', async () => {
    await placeOrder(identity, { items: [{ product_id: 5, quantity: 1 }], clear_cart: true });
    expect(callFor('DELETE FROM cart_items')![1]).toEqual([7]);

    clientQuery.mockClear();
    respond();
    await placeOrder(identity, { items: [{ product_id: 5, quantity: 1 }] });
    expect(callFor('DELETE FROM cart_items')).toBeUndefined();
  });

  it('rolls back when a product is missing or archived', async () => {
    respond({ products: [] });

    await expect(placeOrder(identity, { items: [{ product_id: 5, quantity: 1 }] })).rejects.toThrow(
      'Product 5 is not available'
    );
    expect(sql()).toContain('ROLLBACK');
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('rolls back when the seller is suspended', async () => {
    respond({ products: [{ ...PRODUCT, seller_status: 'suspended' }] });

    await expect(placeOrder(identity, { items: [{ product_id: 5, quantity: 1 }] })).rejects.toThrow(
      'PS5 is temporarily unavailable'
    );
    expect(sql()).toContain('ROLLBACK');
  });

  it('rolls back when stock is insufficient', async () => {
    respond({ products: [{ ...PRODUCT, stock: 1 }] });

    await expect(placeOrder(identity, { items: [{ product_id: 5, quantity: 2 }] })).rejects.toThrow(
      'Only 1 left of PS5'
    );
    expect(sql()).toContain('ROLLBACK');
  });

  it('rolls back and surfaces database failures', async () => {
    clientQuery.mockImplementation((text: string) => {
      if (text.includes('FOR UPDATE OF p')) return Promise.resolve(queryResult([PRODUCT]));
      if (text.includes('INSERT INTO orders')) return Promise.reject(new Error('disk full'));
      return Promise.resolve(queryResult([]));
    });

    await expect(placeOrder(identity, { items: [{ product_id: 5, quantity: 1 }] })).rejects.toThrow(
      'disk full'
    );
    expect(sql()).toContain('ROLLBACK');
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('still releases the connection when the rollback itself fails', async () => {
    clientQuery.mockImplementation((text: string) => {
      if (text === 'ROLLBACK') return Promise.reject(new Error('connection lost'));
      if (text.includes('FOR UPDATE OF p')) return Promise.resolve(queryResult([]));
      return Promise.resolve(queryResult([]));
    });

    await expect(placeOrder(identity, { items: [{ product_id: 5, quantity: 1 }] })).rejects.toThrow(
      'not available'
    );
    expect(release).toHaveBeenCalledTimes(1);
  });
});
