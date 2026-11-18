import { pool } from './pool';
import { seedCatalog } from './seed';

export async function runMigrations(): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id           SERIAL      PRIMARY KEY,
        firebase_uid TEXT        UNIQUE NOT NULL,
        email        TEXT        NOT NULL,
        display_name TEXT        NOT NULL,
        photo_url    TEXT,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS categories (
        id        SERIAL PRIMARY KEY,
        name      TEXT UNIQUE NOT NULL,
        slug      TEXT UNIQUE NOT NULL,
        icon      TEXT,
        parent_id INTEGER REFERENCES categories(id) ON DELETE SET NULL
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS products (
        id          SERIAL        PRIMARY KEY,
        name        TEXT          NOT NULL,
        description TEXT          NOT NULL,
        price       DECIMAL(10,2) NOT NULL,
        image_url   TEXT          NOT NULL,
        category    TEXT          NOT NULL DEFAULT 'general',
        in_stock    BOOLEAN       NOT NULL DEFAULT TRUE,
        created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      ALTER TABLE products ADD COLUMN IF NOT EXISTS brand TEXT;
      ALTER TABLE products ADD COLUMN IF NOT EXISTS rating DECIMAL(3,1) DEFAULT 4.5;
      ALTER TABLE products ADD COLUMN IF NOT EXISTS review_count INTEGER DEFAULT 0;
      ALTER TABLE products ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';
      ALTER TABLE products ADD COLUMN IF NOT EXISTS stock_quantity INTEGER DEFAULT 100;
      ALTER TABLE products ADD COLUMN IF NOT EXISTS discount_pct DECIMAL(4,1) DEFAULT 0;
      ALTER TABLE products ADD COLUMN IF NOT EXISTS original_price DECIMAL(10,2);
      ALTER TABLE products ADD COLUMN IF NOT EXISTS image_urls TEXT[] DEFAULT '{}';
      ALTER TABLE products ADD COLUMN IF NOT EXISTS category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL;
    `);

    // Add search_vector for fast PostgreSQL full-text search
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'products' AND column_name = 'search_vector'
        ) THEN
          ALTER TABLE products ADD COLUMN search_vector tsvector
            GENERATED ALWAYS AS (
              to_tsvector('english', coalesce(name,'') || ' ' || coalesce(description,'') || ' ' || coalesce(brand,'') || ' ' || coalesce(category,''))
            ) STORED;
        END IF;
      END $$;
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_products_search ON products USING GIN(search_vector);
      CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
      CREATE INDEX IF NOT EXISTS idx_products_brand ON products(brand);
      CREATE INDEX IF NOT EXISTS idx_products_price ON products(price);
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS reviews (
        id          SERIAL PRIMARY KEY,
        product_id  INTEGER REFERENCES products(id) ON DELETE CASCADE,
        user_id     INTEGER REFERENCES users(id) ON DELETE CASCADE,
        rating      INTEGER CHECK (rating BETWEEN 1 AND 5),
        comment     TEXT NOT NULL,
        created_at  TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS cart_items (
        id         SERIAL PRIMARY KEY,
        user_id    INTEGER REFERENCES users(id) ON DELETE CASCADE,
        product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
        quantity   INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
        added_at   TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(user_id, product_id)
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id             SERIAL      PRIMARY KEY,
        customer_name  TEXT        NOT NULL,
        customer_email TEXT,
        user_id        INTEGER     REFERENCES users(id) ON DELETE SET NULL,
        product_name   TEXT        NOT NULL,
        status         TEXT        NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending', 'shipped', 'delivered')),
        updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_email TEXT;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_address TEXT;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'Card';
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS total_amount DECIMAL(10,2);
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS coupon_code TEXT;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS phone TEXT;
    `);

    await client.query(`
      CREATE OR REPLACE FUNCTION notify_orders_change()
      RETURNS TRIGGER AS $$
      DECLARE
        payload JSON;
      BEGIN
        IF TG_OP = 'DELETE' THEN
          payload = json_build_object(
            'operation', TG_OP,
            'data',      row_to_json(OLD),
            'timestamp', NOW()
          );
          PERFORM pg_notify('orders_channel', payload::TEXT);
          RETURN OLD;
        ELSE
          payload = json_build_object(
            'operation', TG_OP,
            'data',      row_to_json(NEW),
            'timestamp', NOW()
          );
          PERFORM pg_notify('orders_channel', payload::TEXT);
          RETURN NEW;
        END IF;
      END;
      $$ LANGUAGE plpgsql;
    `);

    await client.query(`
      DROP TRIGGER IF EXISTS orders_change_trigger ON orders;
      CREATE TRIGGER orders_change_trigger
      AFTER INSERT OR UPDATE OR DELETE ON orders
      FOR EACH ROW EXECUTE FUNCTION notify_orders_change();
    `);

    // Seed categories and 500+ products
    await seedCatalog(client);

    console.log('Migrations complete');
  } finally {
    client.release();
  }
}
