import type { PoolClient } from 'pg';
import { seedCatalog, slugify } from '../../src/db/seed';
import { queryResult } from '../helpers/mockPool';

const query = jest.fn();
const client = { query } as unknown as PoolClient;

const sql = () => query.mock.calls.map((call) => String(call[0]));
const callFor = (fragment: string) =>
  query.mock.calls.find((call) => String(call[0]).includes(fragment));

function withProductCount(count: number) {
  query.mockImplementation((text: string) => {
    if (text.includes('INSERT INTO users')) return Promise.resolve(queryResult([{ id: 3 }]));
    if (text.includes('INSERT INTO sellers')) return Promise.resolve(queryResult([{ id: 9 }]));
    if (text.includes('COUNT(*)::INT AS count FROM products')) {
      return Promise.resolve(queryResult([{ count }]));
    }
    return Promise.resolve(queryResult([]));
  });
}

beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  withProductCount(6);
});

describe('slugify', () => {
  it('lowercases and dash-separates', () => {
    expect(slugify('Apple Watch Ultra 2')).toBe('apple-watch-ultra-2');
  });

  it('trims leading and trailing separators', () => {
    expect(slugify('  !Sony WH-1000XM5!  ')).toBe('sony-wh-1000xm5');
  });
});

describe('seedCatalog', () => {
  it('creates the house seller with the seller role', async () => {
    await seedCatalog(client);

    expect(callFor('INSERT INTO users')![1]).toContain('seed-seller-skibidi-originals');
    expect(sql().join('\n')).toContain("SELECT $1, id FROM roles WHERE key = 'seller'");
    expect(callFor('INSERT INTO sellers')![1]).toContain('skibidi-originals');
  });

  it('adopts pre-marketplace products that have no owner', async () => {
    await seedCatalog(client);

    expect(callFor('UPDATE products SET seller_id')![1]).toEqual([9]);
  });

  it('does not insert products when the catalog is populated', async () => {
    await seedCatalog(client);

    expect(callFor('INSERT INTO products')).toBeUndefined();
  });

  it('inserts the starter catalog when the products table is empty', async () => {
    withProductCount(0);

    await seedCatalog(client);

    const inserts = query.mock.calls.filter((call) =>
      String(call[0]).includes('INSERT INTO products')
    );
    expect(inserts).toHaveLength(6);
    expect(inserts.map((call) => call[1][1])).toContain('PlayStation 5');
    expect(inserts[0][1]).toEqual([9, 'iPhone 15 Pro Max', 'iphone-15-pro-max', expect.any(String), '1199.99', 119999, expect.any(String), 'Phones', 25]);
  });
});
