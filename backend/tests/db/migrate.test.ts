import { queryResult } from '../helpers/mockPool';

const clientQuery = jest.fn();
const release = jest.fn();
const connect = jest.fn(() => Promise.resolve({ query: clientQuery, release }));
jest.mock('../../src/db/pool', () => ({ pool: { connect } }));

import { runMigrations } from '../../src/db/migrate';

const sql = () => clientQuery.mock.calls.map((call) => String(call[0]));

beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  clientQuery.mockResolvedValue(queryResult([{ count: '6' }]));
});

describe('runMigrations', () => {
  it('creates the users, products and orders tables and the notify trigger', async () => {
    await runMigrations();

    const statements = sql().join('\n');
    expect(statements).toContain('CREATE TABLE IF NOT EXISTS users');
    expect(statements).toContain('CREATE TABLE IF NOT EXISTS products');
    expect(statements).toContain('CREATE TABLE IF NOT EXISTS orders');
    expect(statements).toContain('ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_email');
    expect(statements).toContain('CREATE OR REPLACE FUNCTION notify_orders_change()');
    expect(statements).toContain('CREATE TRIGGER orders_change_trigger');
  });

  it('releases the client when it finishes', async () => {
    await runMigrations();

    expect(release).toHaveBeenCalledTimes(1);
  });

  it('skips seeding when the catalog is already populated', async () => {
    await runMigrations();

    expect(sql().some((s) => s.includes('INSERT INTO products'))).toBe(false);
  });

  it('seeds the catalog when products table is empty', async () => {
    clientQuery.mockImplementation((text: string) =>
      Promise.resolve(
        text.includes('SELECT COUNT(*) FROM products')
          ? queryResult([{ count: '0' }])
          : queryResult([])
      )
    );

    await runMigrations();

    const insert = sql().find((s) => s.includes('INSERT INTO products'));
    expect(insert).toContain('PlayStation 5');
  });

  it('releases the client even when a statement fails', async () => {
    clientQuery.mockRejectedValue(new Error('permission denied'));

    await expect(runMigrations()).rejects.toThrow('permission denied');
    expect(release).toHaveBeenCalledTimes(1);
  });
});
