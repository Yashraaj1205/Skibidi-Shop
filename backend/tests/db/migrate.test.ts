import { queryResult } from '../helpers/mockPool';

const clientQuery = jest.fn();
const release = jest.fn();
const connect = jest.fn(() => Promise.resolve({ query: clientQuery, release }));
jest.mock('../../src/db/pool', () => ({ pool: { connect } }));

const seedCatalog = jest.fn().mockResolvedValue(undefined);
jest.mock('../../src/db/seed', () => ({ seedCatalog }));

import { runMigrations } from '../../src/db/migrate';
import { migrations } from '../../src/db/migrations';

const sql = () => clientQuery.mock.calls.map((call) => String(call[0]));

function appliedIds(ids: string[]) {
  clientQuery.mockImplementation((text: string) =>
    Promise.resolve(
      text.includes('SELECT id FROM schema_migrations')
        ? queryResult(ids.map((id) => ({ id })))
        : queryResult([])
    )
  );
}

beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  appliedIds([]);
});

describe('runMigrations', () => {
  it('creates the migration ledger before anything else', async () => {
    await runMigrations();

    expect(sql()[0]).toContain('CREATE TABLE IF NOT EXISTS schema_migrations');
  });

  it('applies every pending migration in its own transaction and records it', async () => {
    await runMigrations();

    const statements = sql();
    expect(statements.filter((s) => s === 'BEGIN')).toHaveLength(migrations.length);
    expect(statements.filter((s) => s === 'COMMIT')).toHaveLength(migrations.length);

    const recorded = clientQuery.mock.calls
      .filter((call) => String(call[0]).includes('INSERT INTO schema_migrations'))
      .map((call) => call[1][0]);
    expect(recorded).toEqual(migrations.map((migration) => migration.id));
  });

  it('creates the marketplace tables', async () => {
    await runMigrations();

    const statements = sql().join('\n');
    expect(statements).toContain('CREATE TABLE IF NOT EXISTS sellers');
    expect(statements).toContain('CREATE TABLE IF NOT EXISTS order_items');
    expect(statements).toContain('CREATE TABLE IF NOT EXISTS cart_items');
    expect(statements).toContain('CREATE TABLE IF NOT EXISTS payouts');
    expect(statements).toContain('CREATE TRIGGER orders_change_trigger');
  });

  it('skips migrations that were already applied', async () => {
    appliedIds(migrations.map((migration) => migration.id));

    await runMigrations();

    expect(sql()).not.toContain('BEGIN');
  });

  it('applies only the migrations that are missing', async () => {
    appliedIds(['001']);

    await runMigrations();

    const recorded = clientQuery.mock.calls
      .filter((call) => String(call[0]).includes('INSERT INTO schema_migrations'))
      .map((call) => call[1][0]);
    expect(recorded).toEqual(['002', '003']);
  });

  it('seeds the catalog after migrating', async () => {
    await runMigrations();

    expect(seedCatalog).toHaveBeenCalledWith(expect.objectContaining({ query: clientQuery }));
  });

  it('rolls back and rethrows when a migration fails', async () => {
    clientQuery.mockImplementation((text: string) => {
      if (text.includes('SELECT id FROM schema_migrations')) return Promise.resolve(queryResult([]));
      if (text.includes('CREATE TABLE IF NOT EXISTS users')) {
        return Promise.reject(new Error('permission denied'));
      }
      return Promise.resolve(queryResult([]));
    });

    await expect(runMigrations()).rejects.toThrow('permission denied');
    expect(sql()).toContain('ROLLBACK');
    expect(release).toHaveBeenCalled();
  });

  it('releases the client when it finishes', async () => {
    await runMigrations();

    expect(release).toHaveBeenCalledTimes(1);
  });
});
