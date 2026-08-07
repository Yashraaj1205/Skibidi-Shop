import { Pool } from 'pg';

export const pool = new Pool(
  process.env.DATABASE_URL 
    ? { connectionString: process.env.DATABASE_URL }
    : {
        host:     process.env.DB_HOST || '127.0.0.1',
        port:     Number(process.env.DB_PORT) || 5433,
        database: process.env.DB_NAME || 'apt_orders',
        user:     process.env.DB_USER || 'apt_user',
        password: process.env.DB_PASSWORD || 'apt_pass',
      }
);

pool.on('error', (err) => {
  console.error('Unexpected error on an idle PostgreSQL client:', err);
});
