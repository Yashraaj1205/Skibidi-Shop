import request from 'supertest';
import { appWith } from '../helpers/authState';
import { queryResult } from '../helpers/mockPool';

const query = jest.fn();
jest.mock('../../src/db/pool', () => ({ pool: { query } }));

import catalogRouter from '../../src/api/catalog';
import { encodeCursor } from '../../src/lib/pagination';

const app = appWith('/api', catalogRouter);

const product = (id: number, price = 1000) => ({
  id,
  name: `Product ${id}`,
  slug: `product-${id}`,
  price_cents: price,
  category: 'Gaming',
  seller_id: 1,
  seller_name: 'Skibidi Originals'
});

const lastSQL = () => String(query.mock.calls[query.mock.calls.length - 1][0]);
const lastParams = () => query.mock.calls[query.mock.calls.length - 1][1] as unknown[];

beforeEach(() => {
  query.mockReset();
  query.mockResolvedValue(queryResult([product(1)]));
});

describe('GET /api/products', () => {
  it('returns only active listings from active sellers', async () => {
    const res = await request(app).get('/api/products');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ items: [product(1)], next_cursor: null });
    expect(lastSQL()).toContain("p.status = 'active' AND s.status = 'active'");
    expect(lastSQL()).toContain('ORDER BY p.id DESC');
  });

  it('asks for one row more than the page size and exposes a cursor when there are more', async () => {
    query.mockResolvedValue(queryResult([product(3), product(2), product(1)]));

    const res = await request(app).get('/api/products?limit=2');

    expect(lastParams()[lastParams().length - 1]).toBe(3);
    expect(res.body.items).toHaveLength(2);
    expect(res.body.next_cursor).toBe(encodeCursor({ id: 2, sort_value: 1000 }));
  });

  it('applies search, category, seller, price and stock filters', async () => {
    await request(app).get(
      '/api/products?q=ps5&category=Gaming&seller=skibidi-originals&min_price_cents=100&max_price_cents=90000&in_stock=true'
    );

    const sql = lastSQL();
    expect(sql).toContain('ILIKE');
    expect(sql).toContain('p.category =');
    expect(sql).toContain('s.slug =');
    expect(sql).toContain('p.price_cents >=');
    expect(sql).toContain('p.price_cents <=');
    expect(sql).toContain('p.stock > 0');
    expect(lastParams()).toEqual(['%ps5%', 'Gaming', 'skibidi-originals', 100, 90000, 13]);
  });

  it('does not filter on stock when in_stock is false', async () => {
    await request(app).get('/api/products?in_stock=false');

    expect(lastSQL()).not.toContain('p.stock > 0');
  });

  it.each([
    ['price_asc', 'p.price_cents ASC, p.id ASC', '(p.price_cents, p.id) > ('],
    ['price_desc', 'p.price_cents DESC, p.id DESC', '(p.price_cents, p.id) < ('],
    ['name', 'p.name ASC, p.id ASC', 'p.id >'],
    ['newest', 'p.id DESC', 'p.id <']
  ])('keyset paginates %s ordering', async (sort, order, keyset) => {
    await request(app).get(
      `/api/products?sort=${sort}&cursor=${encodeCursor({ id: 5, sort_value: 2500 })}`
    );

    expect(lastSQL()).toContain(order);
    expect(lastSQL()).toContain(keyset);
  });

  it('treats a price cursor without a sort value as zero', async () => {
    await request(app).get(`/api/products?sort=price_asc&cursor=${encodeCursor({ id: 5 })}`);

    expect(lastParams()).toEqual([0, 5, 13]);
  });

  it('rejects a malformed cursor', async () => {
    const res = await request(app).get('/api/products?cursor=not-a-cursor');

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Invalid cursor' });
  });

  it('rejects an out-of-range limit', async () => {
    const res = await request(app).get('/api/products?limit=500');

    expect(res.status).toBe(400);
    expect(res.body.details).toHaveProperty('limit');
  });
});

describe('GET /api/categories', () => {
  it('returns categories with counts', async () => {
    query.mockResolvedValue(queryResult([{ name: 'Gaming', product_count: 3 }]));

    const res = await request(app).get('/api/categories');

    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ name: 'Gaming', product_count: 3 }]);
    expect(lastSQL()).toContain('GROUP BY p.category');
  });
});

describe('GET /api/products/:slug', () => {
  it('returns the listing', async () => {
    const res = await request(app).get('/api/products/product-1');

    expect(res.status).toBe(200);
    expect(res.body).toEqual(product(1));
    expect(lastParams()).toEqual(['product-1']);
  });

  it('404s for an unknown or inactive listing', async () => {
    query.mockResolvedValue(queryResult([]));

    const res = await request(app).get('/api/products/nope');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Product not found' });
  });
});

describe('GET /api/sellers/:slug', () => {
  it('returns the storefront with its listings', async () => {
    query.mockImplementation((text: string) =>
      Promise.resolve(
        text.includes('FROM sellers')
          ? queryResult([{ id: 1, name: 'Skibidi Originals', slug: 'skibidi-originals' }])
          : queryResult([product(1)])
      )
    );

    const res = await request(app).get('/api/sellers/skibidi-originals');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ slug: 'skibidi-originals', products: [product(1)] });
  });

  it('404s for an unknown or suspended seller', async () => {
    query.mockResolvedValue(queryResult([]));

    const res = await request(app).get('/api/sellers/ghost');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Seller not found' });
  });
});
