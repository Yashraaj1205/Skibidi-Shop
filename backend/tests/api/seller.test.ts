import request from 'supertest';
import { appWith, authState } from '../helpers/authState';
import { makeIdentity } from '../helpers/fixtures';
import { queryResult } from '../helpers/mockPool';

const query = jest.fn();
jest.mock('../../src/db/pool', () => ({ pool: { query } }));
jest.mock('../../src/middleware/auth', () => jest.requireActual('../helpers/authState').mockAuthModule());

import sellerRouter from '../../src/api/seller';

const app = appWith('/api/seller', sellerRouter);

const activeSeller = () =>
  makeIdentity({
    roles: ['customer', 'seller'],
    is_seller: true,
    seller_id: 4,
    seller_status: 'active'
  });

const LISTING = {
  name: 'Mechanical Keyboard',
  description: 'Hot-swappable, 75%',
  price_cents: 12999,
  image_url: 'https://img/kb.png',
  category: 'Peripherals',
  stock: 12,
  status: 'active'
};

const callFor = (fragment: string) =>
  query.mock.calls.find((call) => String(call[0]).includes(fragment));

beforeEach(() => {
  query.mockReset();
  query.mockResolvedValue(queryResult([{ id: 4 }]));
  authState.identity = activeSeller();
});

describe('POST /api/seller/apply', () => {
  it('creates a pending seller and grants the seller role', async () => {
    authState.identity = makeIdentity();
    query.mockResolvedValue(queryResult([{ id: 4, status: 'pending' }]));

    const res = await request(app)
      .post('/api/seller/apply')
      .send({ name: 'Ada Goods', description: 'Fine wares' });

    expect(res.status).toBe(201);
    expect(callFor('INSERT INTO sellers')![1]).toEqual([
      7,
      'Ada Goods',
      'ada-goods-7',
      'Fine wares',
      'ada@example.com',
      'ada@example.com'
    ]);
    expect(String(callFor('INSERT INTO user_roles')![0])).toContain("key = 'seller'");
    expect(res.body).toEqual({ id: 4, status: 'pending' });
  });

  it('keeps the supplied support and payout emails', async () => {
    authState.identity = makeIdentity();

    await request(app).post('/api/seller/apply').send({
      name: 'Ada Goods',
      support_email: 'help@ada.shop',
      payout_email: 'pay@ada.shop'
    });

    expect(callFor('INSERT INTO sellers')![1]!.slice(4)).toEqual(['help@ada.shop', 'pay@ada.shop']);
  });

  it('409s when the caller already has a seller account', async () => {
    const res = await request(app).post('/api/seller/apply').send({ name: 'Ada Goods' });

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'Seller account already exists' });
  });

  it('requires authentication', async () => {
    authState.identity = null;

    const res = await request(app).post('/api/seller/apply').send({ name: 'Ada Goods' });

    expect(res.status).toBe(401);
  });

  it('rejects a too-short store name', async () => {
    authState.identity = makeIdentity();

    const res = await request(app).post('/api/seller/apply').send({ name: 'A' });

    expect(res.status).toBe(400);
  });
});

describe('GET /api/seller/me', () => {
  it('returns the seller record even while pending', async () => {
    authState.identity = makeIdentity({ seller_id: 4, seller_status: 'pending' });
    query.mockResolvedValue(queryResult([{ id: 4, status: 'pending' }]));

    const res = await request(app).get('/api/seller/me');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: 4, status: 'pending' });
  });

  it('404s when the caller never applied', async () => {
    authState.identity = makeIdentity();

    const res = await request(app).get('/api/seller/me');

    expect(res.status).toBe(404);
  });
});

describe('seller-only routes', () => {
  it('403 every operational route for a pending seller', async () => {
    authState.identity = makeIdentity({ seller_id: 4, seller_status: 'pending' });

    const responses = await Promise.all([
      request(app).get('/api/seller/products'),
      request(app).post('/api/seller/products').send(LISTING),
      request(app).patch('/api/seller/products/1').send({ stock: 1 }),
      request(app).delete('/api/seller/products/1'),
      request(app).get('/api/seller/orders'),
      request(app).get('/api/seller/metrics'),
      request(app).get('/api/seller/payouts')
    ]);

    expect(responses.map((res) => res.status)).toEqual([403, 403, 403, 403, 403, 403, 403]);
  });
});

describe('seller listings', () => {
  it('lists only the caller listings', async () => {
    await request(app).get('/api/seller/products');

    expect(callFor('FROM products')![0]).toContain('WHERE seller_id = $1');
    expect(callFor('FROM products')![1]).toEqual([4]);
  });

  it('creates a listing with a slug, legacy price and derived in_stock', async () => {
    const res = await request(app).post('/api/seller/products').send(LISTING);

    expect(res.status).toBe(201);
    expect(callFor('INSERT INTO products')![1]).toEqual([
      4,
      'Mechanical Keyboard',
      'mechanical-keyboard',
      'Hot-swappable, 75%',
      '129.99',
      12999,
      'https://img/kb.png',
      'Peripherals',
      12,
      'active'
    ]);
  });

  it('defaults a new listing to draft with no stock', async () => {
    await request(app)
      .post('/api/seller/products')
      .send({ ...LISTING, stock: undefined, status: undefined });

    const params = callFor('INSERT INTO products')![1]!;
    expect(params[8]).toBe(0);
    expect(params[9]).toBe('draft');
  });

  it('rejects an invalid image url or price', async () => {
    const responses = await Promise.all([
      request(app).post('/api/seller/products').send({ ...LISTING, image_url: 'not-a-url' }),
      request(app).post('/api/seller/products').send({ ...LISTING, price_cents: 10 })
    ]);

    expect(responses.map((res) => res.status)).toEqual([400, 400]);
  });

  it('updates only the supplied fields and keeps price columns in sync', async () => {
    const res = await request(app)
      .patch('/api/seller/products/9')
      .send({ price_cents: 999, stock: 0 });

    expect(res.status).toBe(200);
    const update = callFor('UPDATE products SET');
    expect(String(update![0])).toContain('price_cents = $3, price = ($3::NUMERIC / 100)');
    expect(String(update![0])).toContain('stock = $4, in_stock = $4 > 0');
    expect(update![1]).toEqual([4, 9, 999, 0]);
  });

  it('400s an empty update', async () => {
    const res = await request(app).patch('/api/seller/products/9').send({});

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'No fields to update' });
  });

  it('404s when updating a listing owned by another seller', async () => {
    query.mockResolvedValue(queryResult([], 0));

    const res = await request(app).patch('/api/seller/products/9').send({ stock: 3 });

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Listing not found' });
  });

  it('archives instead of deleting so order history keeps resolving', async () => {
    const res = await request(app).delete('/api/seller/products/9');

    expect(res.status).toBe(204);
    const update = callFor("SET status = 'archived'");
    expect(String(update![0])).toContain('WHERE seller_id = $1 AND id = $2');
    expect(update![1]).toEqual([4, 9]);
  });

  it('404s when archiving a listing owned by another seller', async () => {
    query.mockResolvedValue(queryResult([], 0));

    const res = await request(app).delete('/api/seller/products/9');

    expect(res.status).toBe(404);
  });
});

describe('GET /api/seller/orders', () => {
  it('returns only line items sold by the caller', async () => {
    await request(app).get('/api/seller/orders');

    expect(callFor('FROM order_items oi')![0]).toContain('WHERE oi.seller_id = $1');
    expect(callFor('FROM order_items oi')![1]).toEqual([4, 25]);
  });

  it('filters by order status', async () => {
    await request(app).get('/api/seller/orders?status=delivered&limit=5');

    expect(callFor('FROM order_items oi')![0]).toContain('AND o.status = $2');
    expect(callFor('FROM order_items oi')![1]).toEqual([4, 'delivered', 5]);
  });

  it('rejects an unknown status', async () => {
    const res = await request(app).get('/api/seller/orders?status=refunded');

    expect(res.status).toBe(400);
  });
});

describe('GET /api/seller/metrics', () => {
  it('reports sales, commission and listing health', async () => {
    query.mockImplementation((text: string) =>
      Promise.resolve(
        text.includes('FROM order_items oi')
          ? queryResult([{ order_count: 2, gross_cents: 8000, commission_cents: 800, earnings_cents: 7200, unpaid_cents: 7200 }])
          : queryResult([{ total: 3, active: 2, out_of_stock: 1 }])
      )
    );

    const res = await request(app).get('/api/seller/metrics');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      order_count: 2,
      gross_cents: 8000,
      commission_cents: 800,
      earnings_cents: 7200,
      unpaid_cents: 7200,
      listings: { total: 3, active: 2, out_of_stock: 1 }
    });
    expect(callFor('FROM order_items oi')![0]).toContain("o.status <> 'cancelled'");
  });
});

describe('GET /api/seller/payouts', () => {
  it('returns the caller payouts', async () => {
    await request(app).get('/api/seller/payouts');

    expect(callFor('FROM payouts')![1]).toEqual([4]);
  });
});
