import { pool } from './pool';

export async function runMigrations(): Promise<void> {
  const client = await pool.connect();

  try {
    // 1. Create Users Table
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

    // 2. Create Products Table
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

    // 3. Create Orders Table with User Relations
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

    // Add customer_email and user_id columns if they don't exist (in case orders already existed)
    await client.query(`
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_email TEXT;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
    `);

    // 4. Seed Products if empty
    const productCheck = await client.query('SELECT COUNT(*) FROM products');
    if (parseInt(productCheck.rows[0].count) === 0) {
      console.log('🌱 Seeding initial products database...');
      await client.query(`
        INSERT INTO products (name, description, price, image_url, category) VALUES
        ('iPhone 15 Pro Max', 'Titanium design, powerful A17 Pro chip, customizable Action button, and 5x Telephoto camera.', 1199.99, 'https://images.unsplash.com/photo-1695048133142-1a20484d2569?w=500&auto=format&fit=crop&q=60', 'Electronics'),
        ('MacBook Pro M3 Max', 'The ultimate developer laptop with a 14-core CPU, 30-core GPU, 36GB unified memory, and a gorgeous Liquid Retina XDR display.', 2499.99, 'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=500&auto=format&fit=crop&q=60', 'Electronics'),
        ('Sony WH-1000XM5', 'Industry-leading noise-canceling wireless over-ear headphones with premium sound quality and crystal-clear calls.', 349.99, 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=500&auto=format&fit=crop&q=60', 'Audio'),
        ('Keychron Q1 Pro', 'Ultra-premium, full-aluminum custom mechanical keyboard with hot-swappable switches and custom RGB backlight.', 199.99, 'https://images.unsplash.com/photo-1618384887929-16ec33fab9ef?w=500&auto=format&fit=crop&q=60', 'Peripherals'),
        ('Apple Watch Ultra 2', 'The most rugged and capable Apple Watch ever, designed for outdoor adventures and athletic performance.', 799.99, 'https://images.unsplash.com/photo-1434494878577-86c23bcb06b9?w=500&auto=format&fit=crop&q=60', 'Wearables'),
        ('Sony PlayStation 5', 'Experience lightning-fast loading with an ultra-high-speed SSD, deeper immersion with haptic feedback, and all-new gaming marvels.', 499.99, 'https://images.unsplash.com/photo-1606813907291-d86efa9b94db?w=500&auto=format&fit=crop&q=60', 'Gaming')
      `);
      console.log('✓ Product database successfully seeded.');
    }

    // 5. Setup Notify Trigger
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

    console.log('✓ Migrations complete (all 3 tables + trigger ready)');
  } finally {
    client.release();
  }
}
