import request from 'supertest';
import { appWith, authState } from '../helpers/authState';
import { makeIdentity, makeOrder } from '../helpers/fixtures';
import { queryResult } from '../helpers/mockPool';

const query = jest.fn();
jest.mock('../../src/db/pool', () => ({ pool: { query } }));
jest.mock('../../src/middleware/auth', () => jest.requireActual('../helpers/authState').mockAuthModule());

const placeOrder = jest.fn();
jest.mock('../../src/services/checkout', () => ({ placeOrder }));

import storeRouter from '../../src/api/store';

const app = appWith('/api/store', storeRouter);

const ADDRESS = {
  full_name: 'Ada Lovelace',
  line1: '1 Analytical Way',
  city: 'London',
  postal_code: 'E1 6AN',
  country: 'GB'
};

const callFor = (fragment: string) =>
  query.mock.calls.find((call) => String(call[0]).includes(fragment));

beforeEach(() => {
  query.mockReset();
  placeOrder.mockReset();
  authState.identity = makeIdentity();
  query.mockResolvedValue(queryResult([]));
  placeOrder.mockResolvedValue({ order: makeOrder(), items: [] });
});

describe('/api/store', () => {
  it('requires authentication on every route', async () => {
    authState.identity = null;

    const responses = await Promise.all([
      request(app).post('/api/store/checkout').send({ address: ADDRESS }),
      request(app).post('/api/store/orders').send({ product_id: 5 }),
      request(app).get('/api/store/my-orders'),
      request(app).get('/api/store/orders/42')
    ]);

    expect(responses.map((res) => res.status)).toEqual([401, 401, 401, 401]);
  });
});

describe('POST /api/store/checkout', () => {
  it('places the caller cart as one order and clears the cart', async () => {
    query.mockResolvedValue(queryResult([{ product_id: 5, quantity: 2 }]));

    const res = await request(app).post('/api/store/checkout').send({ address: ADDRESS });

    expect(res.status).toBe(201);
    expect(callFor('FROM cart_items ci')![1]).toEqual([7]);
    expect(placeOrder).toHaveBeenCalledWith(authState.identity, {
      items: [{ product_id: 5, quantity: 2 }],
      address: expect.objectContaining({ line1: '1 Analytical Way', region: '' }),
      clear_cart: true
    });
    expect(res.body.order.order_number).toBe('SKB-000042');
  });

  it('400s when the cart is empty', async () => {
    const res = await request(app).post('/api/store/checkout').send({ address: ADDRESS });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Cart is empty' });
    expect(placeOrder).not.toHaveBeenCalled();
  });

  it('rejects an incomplete address', async () => {
    const res = await request(app)
      .post('/api/store/checkout')
      .send({ address: { ...ADDRESS, line1: '' } });

    expect(res.status).toBe(400);
    expect(res.body.details).toHaveProperty(['address.line1']);
  });

  it('surfaces checkout failures such as sold-out stock', async () => {
    query.mockResolvedValue(queryResult([{ product_id: 5, quantity: 2 }]));
    const { HttpError } = jest.requireActual('../../src/middleware/error');
    placeOrder.mockRejectedValue(new HttpError(409, 'Only 1 left of PS5'));

    const res = await request(app).post('/api/store/checkout').send({ address: ADDRESS });

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'Only 1 left of PS5' });
  });
});

describe('POST /api/store/orders', () => {
  it('buys a single product without a cart', async () => {
    const res = await request(app).post('/api/store/orders').send({ product_id: 5, quantity: 3 });

    expect(res.status).toBe(201);
    expect(placeOrder).toHaveBeenCalledWith(authState.identity, {
      items: [{ product_id: 5, quantity: 3 }]
    });
    expect(res.body).toEqual(makeOrder());
  });

  it('defaults the quantity to one', async () => {
    await request(app).post('/api/store/orders').send({ product_id: 5 });

    expect(placeOrder.mock.calls[0][1].items[0].quantity).toBe(1);
  });

  it('rejects a missing product id', async () => {
    const res = await request(app).post('/api/store/orders').send({});

    expect(res.status).toBe(400);
  });
});

describe('GET /api/store/my-orders', () => {
  it('returns only the caller orders with their line items', async () => {
    query.mockResolvedValue(queryResult([{ ...makeOrder(), items: [] }]));

    const res = await request(app).get('/api/store/my-orders');

    expect(res.status).toBe(200);
    expect(callFor('FROM orders o')![0]).toContain('WHERE o.user_id = $1');
    expect(callFor('FROM orders o')![1]).toEqual([7]);
    expect(res.body).toHaveLength(1);
  });
});

describe('GET /api/store/orders/:id', () => {
  it('returns the order with items, history and shipping address', async () => {
    query.mockImplementation((text: string) => {
      if (text.includes('FROM orders')) {
        return Promise.resolve(queryResult([makeOrder({ shipping_address_id: 77 })]));
      }
      if (text.includes('FROM order_items')) return Promise.resolve(queryResult([{ id: 200 }]));
      if (text.includes('FROM order_status_history')) {
        return Promise.resolve(queryResult([{ status: 'pending' }]));
      }
      return Promise.resolve(queryResult([{ id: 77, city: 'London' }]));
    });

    const res = await request(app).get('/api/store/orders/42');

    expect(res.status).toBe(200);
    expect(callFor('FROM orders')![1]).toEqual([42, 7]);
    expect(res.body).toMatchObject({
      id: 42,
      items: [{ id: 200 }],
      history: [{ status: 'pending' }],
      shipping_address: { id: 77, city: 'London' }
    });
  });

  it('reports a null shipping address when the order has none', async () => {
    query.mockImplementation((text: string) =>
      Promise.resolve(text.includes('FROM orders') ? queryResult([makeOrder()]) : queryResult([]))
    );

    const res = await request(app).get('/api/store/orders/42');

    expect(res.body.shipping_address).toBeNull();
  });

  it('404s for an order that belongs to somebody else', async () => {
    const res = await request(app).get('/api/store/orders/42');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Order not found' });
  });

  it('rejects a non-numeric order id', async () => {
    const res = await request(app).get('/api/store/orders/abc');

    expect(res.status).toBe(400);
  });
});
