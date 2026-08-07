import { pool } from './pool';
import { migrations } from './migrations';
import { seedCatalog } from './seed';

export async function runMigrations(): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id         TEXT        PRIMARY KEY,
        name       TEXT        NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    const applied = await client.query('SELECT id FROM schema_migrations');
    const done = new Set<string>(applied.rows.map((row) => row.id));

    for (const migration of migrations) {
      if (done.has(migration.id)) continue;

      await client.query('BEGIN');
      try {
        await client.query(migration.sql);
        await client.query('INSERT INTO schema_migrations (id, name) VALUES ($1, $2)', [
          migration.id,
          migration.name
        ]);
        await client.query('COMMIT');
        console.log(`Applied migration ${migration.id}_${migration.name}`);
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
    }

    await seedCatalog(client);
    console.log('Migrations complete');
  } finally {
    client.release();
  }
}
