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

const originalUrl = process.env.DATABASE_URL;

afterEach(() => {
  if (originalUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = originalUrl;
});

describe('pool', () => {
  it('uses DATABASE_URL when set', () => {
    process.env.DATABASE_URL = 'postgres://user:pass@host:5432/db';

    loadPool();

    expect(poolConstructor).toHaveBeenCalledWith({
      connectionString: 'postgres://user:pass@host:5432/db',
    });
  });

  it('falls back to defaults when no connection settings are provided', () => {
    delete process.env.DATABASE_URL;

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
