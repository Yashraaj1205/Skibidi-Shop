const poolConstructor = jest.fn();
jest.mock('pg', () => ({
  Pool: class {
    constructor(config: unknown) {
      poolConstructor(config);
    }
  },
}));

function loadPool(): void {
  jest.isolateModules(() => {
    require('../../src/db/pool');
  });
}

const DB_VARS = [
  'DATABASE_URL',
  'DB_HOST',
  'DB_PORT',
  'DB_NAME',
  'DB_USER',
  'DB_PASSWORD',
] as const;

const originalEnv = process.env;

beforeEach(() => {
  process.env = { ...originalEnv };
  for (const key of DB_VARS) delete process.env[key];
});

afterEach(() => {
  process.env = originalEnv;
});

describe('pool', () => {
  it('reads discrete connection settings from the environment', () => {
    process.env.DB_HOST = 'db.internal';
    process.env.DB_PORT = '6543';
    process.env.DB_NAME = 'shop';
    process.env.DB_USER = 'shop_user';
    process.env.DB_PASSWORD = 'shop_pass';

    loadPool();

    expect(poolConstructor).toHaveBeenCalledWith({
      host: 'db.internal',
      port: 6543,
      database: 'shop',
      user: 'shop_user',
      password: 'shop_pass',
    });
  });

  it('uses DATABASE_URL when set', () => {
    process.env.DATABASE_URL = 'postgres://user:pass@host:5432/db';

    loadPool();

    expect(poolConstructor).toHaveBeenCalledWith({
      connectionString: 'postgres://user:pass@host:5432/db',
    });
  });

  it('falls back to defaults when no connection settings are provided', () => {
    loadPool();

    expect(poolConstructor).toHaveBeenCalledWith({
      host: '127.0.0.1',
      port: 5433,
      database: 'apt_orders',
      user: 'apt_user',
      password: 'apt_pass',
    });
  });
});
