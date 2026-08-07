import request from 'supertest';
import { appWith, authState } from '../helpers/authState';
import { makeIdentity } from '../helpers/fixtures';
import { queryResult } from '../helpers/mockPool';

const query = jest.fn();
jest.mock('../../src/db/pool', () => ({ pool: { query } }));
jest.mock('../../src/middleware/auth', () => jest.requireActual('../helpers/authState').mockAuthModule());

import cartRouter from '../../src/api/cart';

const app = appWith('/api/cart', cartRouter);

const CART_ITEM = {
  id: 11,
  product_id: 5,
  quantity: 2,
  name: 'PS5',
  price_cents: 4000,
  currency: 'USD',
  stock: 10,
  line_total_cents: 8000
};

function respond(options: { items?: unknown[]; stock?: number; quantity?: number } = {}) {
  const items = options.items ?? [CART_ITEM];

  query.mockImplementation((text: string) => {
    if (text.includes('INSERT INTO carts')) return Promise.resolve(queryResult([{ id: 3 }]));
    if (text.includes('FROM cart_items ci')) return Promise.resolve(queryResult(items));
    if (text.includes('SELECT p.stock FROM products')) {
      return Promise.resolve(
        options.stock === undefined ? queryResult([{ stock: 10 }]) : queryResult([{ stock: options.stock }])
      );
    }
    if (text.includes('INSERT INTO cart_items')) {
      return Promise.resolve(queryResult([{ quantity: options.quantity ?? 2 }]));
    }
    if (text.includes('UPDATE cart_items')) return Promise.resolve(queryResult([{ id: 11 }]));
    if (text.includes('DELETE FROM cart_items')) return Promise.resolve(queryResult([], 1));
    return Promise.resolve(queryResult([]));
  });
}

const callFor = (fragment: string) =>
  query.mock.calls.find((call) => String(call[0]).includes(fragment));

beforeEach(() => {
  query.mockReset();
  authState.identity = makeIdentity();
  respond();
});

describe('/api/cart', () => {
  it('requires authentication on every route', async () => {
    authState.identity = null;

    const responses = await Promise.all([
      request(app).get('/api/cart'),
      request(app).post('/api/cart/items').send({ product_id: 5 }),
      request(app).patch('/api/cart/items/11').send({ quantity: 2 }),
      request(app).delete('/api/cart/items/11'),
      request(app).delete('/api/cart')
    ]);

    expect(responses.map((res) => res.status)).toEqual([401, 401, 401, 401, 401]);
  });

  it('returns the cart with totals and free shipping above the threshold', async () => {
    const res = await request(app).get('/api/cart');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: 3,
      subtotal_cents: 8000,
      shipping_cents: 999,
      total_cents: 8999,
      currency: 'USD'
    });
  });

  it('charges no shipping once the cart passes the free-shipping threshold', async () => {
    respond({ items: [{ ...CART_ITEM, line_total_cents: 20000 }] });

    const res = await request(app).get('/api/cart');

    expect(res.body).toMatchObject({ subtotal_cents: 20000, shipping_cents: 0, total_cents: 20000 });
  });

  it('reports an empty cart with zero totals', async () => {
    respond({ items: [] });

    const res = await request(app).get('/api/cart');

    expect(res.body).toMatchObject({ items: [], subtotal_cents: 0, shipping_cents: 0, currency: 'USD' });
  });

  it('adds an item and returns the recalculated cart', async () => {
    const res = await request(app).post('/api/cart/items').send({ product_id: 5, quantity: 2 });

    expect(res.status).toBe(201);
    expect(callFor('INSERT INTO cart_items')![1]).toEqual([3, 5, 2, 10]);
    expect(res.body).toMatchObject({ subtotal_cents: 8000 });
  });

  it('defaults the quantity to one', async () => {
    await request(app).post('/api/cart/items').send({ product_id: 5 });

    expect(callFor('INSERT INTO cart_items')![1]![2]).toBe(1);
  });

  it('404s when the product is not purchasable', async () => {
    query.mockImplementation((text: string) =>
      Promise.resolve(
        text.includes('SELECT p.stock FROM products') ? queryResult([]) : queryResult([{ id: 3 }])
      )
    );

    const res = await request(app).post('/api/cart/items').send({ product_id: 5 });

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Product not available' });
  });

  it('409s when the merged quantity exceeds stock', async () => {
    respond({ stock: 1, quantity: 2 });

    const res = await request(app).post('/api/cart/items').send({ product_id: 5, quantity: 2 });

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'Only 1 left in stock' });
  });

  it('rejects an invalid product id', async () => {
    const res = await request(app).post('/api/cart/items').send({ product_id: 'abc' });

    expect(res.status).toBe(400);
    expect(res.body.details).toHaveProperty('product_id');
  });

  it('updates a quantity only for the caller\'s own cart', async () => {
    const res = await request(app).patch('/api/cart/items/11').send({ quantity: 3 });

    expect(res.status).toBe(200);
    expect(callFor('UPDATE cart_items')![1]).toEqual([11, 7, 3]);
    expect(String(callFor('UPDATE cart_items')![0])).toContain('SELECT id FROM carts WHERE user_id');
  });

  it('409s when the item is missing or short on stock', async () => {
    query.mockImplementation((text: string) =>
      Promise.resolve(text.includes('UPDATE cart_items') ? queryResult([]) : queryResult([{ id: 3 }]))
    );

    const res = await request(app).patch('/api/cart/items/11').send({ quantity: 3 });

    expect(res.status).toBe(409);
  });

  it('rejects a zero quantity', async () => {
    const res = await request(app).patch('/api/cart/items/11').send({ quantity: 0 });

    expect(res.status).toBe(400);
  });

  it('removes a single item', async () => {
    const res = await request(app).delete('/api/cart/items/11');

    expect(res.status).toBe(200);
    expect(callFor('DELETE FROM cart_items')![1]).toEqual([11, 7]);
  });

  it('404s when removing an item that is not in the caller cart', async () => {
    query.mockImplementation((text: string) =>
      Promise.resolve(
        text.includes('DELETE FROM cart_items') ? queryResult([], 0) : queryResult([{ id: 3 }])
      )
    );

    const res = await request(app).delete('/api/cart/items/11');

    expect(res.status).toBe(404);
  });

  it('empties the cart', async () => {
    const res = await request(app).delete('/api/cart');

    expect(res.status).toBe(200);
    expect(callFor('DELETE FROM cart_items')![1]).toEqual([7]);
  });
});
