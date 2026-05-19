import { pool } from './pool';

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
    `);

    const productCheck = await client.query('SELECT COUNT(*) FROM products');
    if (parseInt(productCheck.rows[0].count) === 0) {
      console.log('Seeding product catalog...');
      await client.query(`
        INSERT INTO products (name, description, price, image_url, category) VALUES
        ('iPhone 15 Pro Max', 'Titanium design with A17 Pro chip, customizable Action button, and 5x Telephoto camera.', 1199.99, 'https://images.unsplash.com/photo-1695048133142-1a20484d2569?w=500&auto=format&fit=crop&q=60', 'Phones'),
        ('MacBook Pro M3', 'The ultimate laptop with 14-core CPU, 30-core GPU, 36GB unified memory, and Liquid Retina XDR display.', 2499.99, 'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=500&auto=format&fit=crop&q=60', 'Laptops'),
        ('Sony WH-1000XM5', 'Industry-leading noise-canceling wireless headphones with premium sound and crystal-clear calls.', 349.99, 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=500&auto=format&fit=crop&q=60', 'Audio'),
        ('Keychron Q1 Pro', 'Full-aluminum custom mechanical keyboard with hot-swappable switches and RGB backlight.', 199.99, 'https://images.unsplash.com/photo-1618384887929-16ec33fab9ef?w=500&auto=format&fit=crop&q=60', 'Peripherals'),
        ('Apple Watch Ultra 2', 'The most rugged Apple Watch ever built for outdoor adventures and peak athletic performance.', 799.99, 'https://images.unsplash.com/photo-1434494878577-86c23bcb06b9?w=500&auto=format&fit=crop&q=60', 'Wearables'),
        ('PlayStation 5', 'Lightning-fast SSD, haptic feedback, adaptive triggers, and stunning 4K gaming experiences.', 499.99, 'https://images.unsplash.com/photo-1606813907291-d86efa9b94db?w=500&auto=format&fit=crop&q=60', 'Gaming')
      `);
      console.log('Product catalog seeded');
    }

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

    console.log('Migrations complete');
  } finally {
    client.release();
  }
}
