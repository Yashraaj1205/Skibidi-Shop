import request from 'supertest';
import { appWith, authState } from '../helpers/authState';
import { makeIdentity, makeOrder } from '../helpers/fixtures';
import { queryResult } from '../helpers/mockPool';

const query = jest.fn();
jest.mock('../../src/db/pool', () => ({ pool: { query } }));
jest.mock('../../src/middleware/auth', () => jest.requireActual('../helpers/authState').mockAuthModule());

const runPayouts = jest.fn();
jest.mock('../../src/services/payouts', () => ({ runPayouts }));

import adminRouter, { ordersRouter } from '../../src/api/admin';
import { encodeCursor } from '../../src/lib/pagination';

const app = appWith('/api/admin', adminRouter);
const legacyApp = appWith('/api/orders', ordersRouter);

const admin = () => makeIdentity({ roles: ['customer', 'admin'], is_admin: true });

const callFor = (fragment: string) =>
  query.mock.calls.find((call) => String(call[0]).includes(fragment));

beforeEach(() => {
  query.mockReset();
  runPayouts.mockReset();
  authState.identity = admin();
  query.mockResolvedValue(queryResult([makeOrder()]));
  runPayouts.mockResolvedValue([]);
});

describe('admin authorization', () => {
  it('401s unauthenticated callers', async () => {
    authState.identity = null;

    const res = await request(app).get('/api/admin/orders');

    expect(res.status).toBe(401);
  });

  it('403s authenticated non-admins on every admin surface', async () => {
    authState.identity = makeIdentity();

    const responses = await Promise.all([
      request(app).get('/api/admin/orders'),
      request(app).get('/api/admin/sellers'),
      request(app).patch('/api/admin/sellers/4').send({ status: 'active' }),
      request(app).get('/api/admin/metrics'),
      request(app).get('/api/admin/payouts'),
      request(app).post('/api/admin/payouts/run'),
      request(app).patch('/api/admin/payouts/50').send({ status: 'paid' })
    ]);

    expect(responses.map((res) => res.status)).toEqual([403, 403, 403, 403, 403, 403, 403]);
    expect(query).not.toHaveBeenCalled();
  });

  it('403s non-admins on the legacy /api/orders mount', async () => {
    authState.identity = makeIdentity();

    const responses = await Promise.all([
      request(legacyApp).get('/api/orders'),
      request(legacyApp).post('/api/orders').send({ customer_name: 'A', product_name: 'B' }),
      request(legacyApp).patch('/api/orders/1').send({ status: 'shipped' }),
      request(legacyApp).delete('/api/orders/1')
    ]);

    expect(responses.map((res) => res.status)).toEqual([403, 403, 403, 403]);
  });
});

describe('GET /api/admin/orders', () => {
  it('returns a page of orders with item counts', async () => {
    const res = await request(app).get('/api/admin/orders');

    expect(res.status).toBe(200);
    expect(res.body.next_cursor).toBeNull();
    expect(callFor('FROM orders o')![0]).toContain('AS item_count');
    expect(callFor('FROM orders o')![1]).toEqual([26]);
  });

  it('filters by status, search text and seller', async () => {
    await request(app).get('/api/admin/orders?status=paid&q=ada&seller_id=4');

    const sql = String(callFor('FROM orders o')![0]);
    expect(sql).toContain('o.status = $1');
    expect(sql).toContain('o.order_number ILIKE $2');
    expect(sql).toContain('oi.seller_id = $3');
    expect(callFor('FROM orders o')![1]).toEqual(['paid', '%ada%', 4, 26]);
  });

  it('keyset paginates from a cursor', async () => {
    await request(app).get(`/api/admin/orders?limit=1&cursor=${encodeCursor({ id: 40 })}`);

    expect(String(callFor('FROM orders o')![0])).toContain('o.id < $1');
    expect(callFor('FROM orders o')![1]).toEqual([40, 2]);
  });

  it('exposes the next cursor when more orders remain', async () => {
    query.mockResolvedValue(queryResult([makeOrder({ id: 42 }), makeOrder({ id: 41 })]));

    const res = await request(app).get('/api/admin/orders?limit=1');

    expect(res.body.items).toHaveLength(1);
    expect(res.body.next_cursor).toBe(encodeCursor({ id: 42 }));
  });

  it('rejects a malformed cursor', async () => {
    const res = await request(app).get('/api/admin/orders?cursor=nope');

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Invalid cursor' });
  });
});

describe('POST /api/admin/orders', () => {
  it('creates a manual order and backfills the order number', async () => {
    query.mockImplementation((text: string) =>
      Promise.resolve(
        text.includes('INSERT INTO orders')
          ? queryResult([{ id: 100 }])
          : queryResult([makeOrder({ id: 100, order_number: 'SKB-000100' })])
      )
    );

    const res = await request(app)
      .post('/api/admin/orders')
      .send({ customer_name: 'Ada', product_name: 'PS5' });

    expect(res.status).toBe(201);
    expect(callFor('INSERT INTO orders')![1]).toEqual(['Ada', null, 'PS5', 'pending']);
    expect(callFor('SET order_number')![1]).toEqual([100]);
    expect(res.body.order_number).toBe('SKB-000100');
  });

  it('rejects a missing customer name', async () => {
    const res = await request(app).post('/api/admin/orders').send({ product_name: 'PS5' });

    expect(res.status).toBe(400);
  });
});

describe('GET /api/admin/orders/:id', () => {
  it('returns items with seller names, history, address and payment', async () => {
    query.mockImplementation((text: string) => {
      if (text.includes('FROM orders')) {
        return Promise.resolve(queryResult([makeOrder({ shipping_address_id: 77 })]));
      }
      if (text.includes('FROM order_items oi')) {
        return Promise.resolve(queryResult([{ id: 200, seller_name: 'Skibidi Originals' }]));
      }
      if (text.includes('FROM order_status_history')) {
        return Promise.resolve(queryResult([{ status: 'pending' }]));
      }
      if (text.includes('FROM addresses')) return Promise.resolve(queryResult([{ id: 77 }]));
      return Promise.resolve(queryResult([{ id: 300, status: 'captured' }]));
    });

    const res = await request(app).get('/api/admin/orders/42');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      items: [{ id: 200, seller_name: 'Skibidi Originals' }],
      history: [{ status: 'pending' }],
      shipping_address: { id: 77 },
      payment: { id: 300, status: 'captured' }
    });
  });

  it('nulls the address and payment when there are none', async () => {
    query.mockImplementation((text: string) =>
      Promise.resolve(text.includes('FROM orders') ? queryResult([makeOrder()]) : queryResult([]))
    );

    const res = await request(app).get('/api/admin/orders/42');

    expect(res.body.shipping_address).toBeNull();
    expect(res.body.payment).toBeNull();
  });

  it('404s an unknown order', async () => {
    query.mockResolvedValue(queryResult([]));

    const res = await request(app).get('/api/admin/orders/42');

    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/admin/orders/:id', () => {
  it('updates the status and records who changed it', async () => {
    const res = await request(app)
      .patch('/api/admin/orders/42')
      .send({ status: 'shipped', note: 'handed to courier' });

    expect(res.status).toBe(200);
    expect(callFor('UPDATE orders SET status')![1]).toEqual([42, 'shipped']);
    expect(callFor('INSERT INTO order_status_history')![1]).toEqual([
      42,
      'shipped',
      'handed to courier',
      7
    ]);
  });

  it('stores a null note when none is supplied', async () => {
    await request(app).patch('/api/admin/orders/42').send({ status: 'delivered' });

    expect(callFor('INSERT INTO order_status_history')![1]![2]).toBeNull();
  });

  it('404s an unknown order', async () => {
    query.mockResolvedValue(queryResult([], 0));

    const res = await request(app).patch('/api/admin/orders/42').send({ status: 'shipped' });

    expect(res.status).toBe(404);
    expect(callFor('INSERT INTO order_status_history')).toBeUndefined();
  });

  it('rejects an unknown status', async () => {
    const res = await request(app).patch('/api/admin/orders/42').send({ status: 'refunded' });

    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/admin/orders/:id', () => {
  it('deletes an order', async () => {
    const res = await request(app).delete('/api/admin/orders/42');

    expect(res.status).toBe(204);
    expect(callFor('DELETE FROM orders')![1]).toEqual([42]);
  });

  it('404s an unknown order', async () => {
    query.mockResolvedValue(queryResult([], 0));

    const res = await request(app).delete('/api/admin/orders/42');

    expect(res.status).toBe(404);
  });
});

describe('sellers', () => {
  it('lists sellers with owner, listing count and earnings', async () => {
    query.mockResolvedValue(queryResult([{ id: 4, owner_email: 'ada@example.com' }]));

    const res = await request(app).get('/api/admin/sellers');

    expect(res.status).toBe(200);
    expect(String(callFor('FROM sellers s')![0])).toContain('AS earnings_cents');
    expect(callFor('FROM sellers s')![1]).toEqual([]);
  });

  it('filters sellers by status', async () => {
    await request(app).get('/api/admin/sellers?status=pending');

    expect(String(callFor('FROM sellers s')![0])).toContain('WHERE s.status = $1');
    expect(callFor('FROM sellers s')![1]).toEqual(['pending']);
  });

  it('approves a seller', async () => {
    query.mockResolvedValue(queryResult([{ id: 4, status: 'active' }]));

    const res = await request(app).patch('/api/admin/sellers/4').send({ status: 'active' });

    expect(res.status).toBe(200);
    expect(String(callFor('UPDATE sellers SET')![0])).toContain('status = $2');
    expect(callFor('UPDATE sellers SET')![1]).toEqual([4, 'active']);
  });

  it('updates the commission rate', async () => {
    await request(app).patch('/api/admin/sellers/4').send({ commission_bps: 1500 });

    expect(String(callFor('UPDATE sellers SET')![0])).toContain('commission_bps = $2');
    expect(callFor('UPDATE sellers SET')![1]).toEqual([4, 1500]);
  });

  it('rejects an empty update and an out-of-range commission', async () => {
    const responses = await Promise.all([
      request(app).patch('/api/admin/sellers/4').send({}),
      request(app).patch('/api/admin/sellers/4').send({ commission_bps: 9000 })
    ]);

    expect(responses.map((res) => res.status)).toEqual([400, 400]);
  });

  it('404s an unknown seller', async () => {
    query.mockResolvedValue(queryResult([], 0));

    const res = await request(app).patch('/api/admin/sellers/4').send({ status: 'suspended' });

    expect(res.status).toBe(404);
  });
});

describe('GET /api/admin/metrics', () => {
  it('aggregates orders, commission, counts and a full status breakdown', async () => {
    query.mockImplementation((text: string) => {
      if (text.includes('FROM orders\n') || text.includes('AS orders_7d')) {
        return Promise.resolve(
          queryResult([
            { order_count: 3, gross_cents: 9000, pending_count: 1, delivered_count: 1, orders_7d: 2 }
          ])
        );
      }
      if (text.includes('FROM order_items')) {
        return Promise.resolve(queryResult([{ commission_cents: 900, seller_earnings_cents: 8100 }]));
      }
      if (text.includes('AS seller_count')) {
        return Promise.resolve(
          queryResult([
            { seller_count: 2, pending_sellers: 1, active_listings: 6, user_count: 4 }
          ])
        );
      }
      return Promise.resolve(queryResult([{ status: 'paid', count: 2 }]));
    });

    const res = await request(app).get('/api/admin/metrics');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      order_count: 3,
      gross_cents: 9000,
      commission_cents: 900,
      seller_count: 2,
      orders_by_status: { pending: 0, paid: 2, shipped: 0, delivered: 0, cancelled: 0 }
    });
  });
});

describe('payouts', () => {
  it('lists payouts with the seller name', async () => {
    query.mockResolvedValue(queryResult([{ id: 50, seller_name: 'Skibidi Originals' }]));

    const res = await request(app).get('/api/admin/payouts');

    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ id: 50, seller_name: 'Skibidi Originals' }]);
  });

  it('runs a payout sweep', async () => {
    runPayouts.mockResolvedValue([{ id: 50, amount_cents: 7200 }]);

    const res = await request(app).post('/api/admin/payouts/run');

    expect(res.status).toBe(201);
    expect(res.body).toEqual([{ id: 50, amount_cents: 7200 }]);
  });

  it('marks a payout as paid and stamps paid_at', async () => {
    query.mockResolvedValue(queryResult([{ id: 50, status: 'paid' }]));

    const res = await request(app).patch('/api/admin/payouts/50').send({ status: 'paid' });

    expect(res.status).toBe(200);
    expect(String(callFor('UPDATE payouts')![0])).toContain("CASE WHEN $2 = 'paid' THEN NOW()");
    expect(callFor('UPDATE payouts')![1]).toEqual([50, 'paid']);
  });

  it('404s an unknown payout and rejects an unknown status', async () => {
    query.mockResolvedValue(queryResult([], 0));

    const responses = await Promise.all([
      request(app).patch('/api/admin/payouts/50').send({ status: 'failed' }),
      request(app).patch('/api/admin/payouts/50').send({ status: 'reversed' })
    ]);

    expect(responses.map((res) => res.status)).toEqual([404, 400]);
  });
});
