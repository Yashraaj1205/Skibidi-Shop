export interface Migration {
  id: string;
  name: string;
  sql: string;
}

const baseline: Migration = {
  id: '001',
  name: 'baseline_orders',
  sql: `
    CREATE TABLE IF NOT EXISTS users (
      id           SERIAL      PRIMARY KEY,
      firebase_uid TEXT        UNIQUE NOT NULL,
      email        TEXT        NOT NULL,
      display_name TEXT        NOT NULL,
      photo_url    TEXT,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

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

    CREATE TABLE IF NOT EXISTS orders (
      id             SERIAL      PRIMARY KEY,
      customer_name  TEXT        NOT NULL,
      customer_email TEXT,
      user_id        INTEGER     REFERENCES users(id) ON DELETE SET NULL,
      product_name   TEXT        NOT NULL,
      status         TEXT        NOT NULL DEFAULT 'pending',
      updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_email TEXT;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
  `
};

const marketplace: Migration = {
  id: '002',
  name: 'multi_vendor_marketplace',
  sql: `
    CREATE TABLE IF NOT EXISTS roles (
      id   SERIAL PRIMARY KEY,
      key  TEXT   UNIQUE NOT NULL
    );

    INSERT INTO roles (key) VALUES ('customer'), ('seller'), ('admin')
    ON CONFLICT (key) DO NOTHING;

    CREATE TABLE IF NOT EXISTS user_roles (
      user_id    INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role_id    INTEGER     NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, role_id)
    );

    CREATE TABLE IF NOT EXISTS sellers (
      id              SERIAL      PRIMARY KEY,
      user_id         INTEGER     UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name            TEXT        NOT NULL,
      slug            TEXT        UNIQUE NOT NULL,
      description     TEXT        NOT NULL DEFAULT '',
      support_email   TEXT,
      payout_email    TEXT,
      commission_bps  INTEGER     NOT NULL DEFAULT 1000 CHECK (commission_bps BETWEEN 0 AND 5000),
      status          TEXT        NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'active', 'suspended')),
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    ALTER TABLE products ADD COLUMN IF NOT EXISTS seller_id    INTEGER REFERENCES sellers(id) ON DELETE CASCADE;
    ALTER TABLE products ADD COLUMN IF NOT EXISTS slug         TEXT;
    ALTER TABLE products ADD COLUMN IF NOT EXISTS price_cents  INTEGER;
    ALTER TABLE products ADD COLUMN IF NOT EXISTS currency     TEXT NOT NULL DEFAULT 'USD';
    ALTER TABLE products ADD COLUMN IF NOT EXISTS stock        INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE products ADD COLUMN IF NOT EXISTS status       TEXT NOT NULL DEFAULT 'active';
    ALTER TABLE products ADD COLUMN IF NOT EXISTS updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW();

    -- Money moves to integer minor units; the legacy DECIMAL column stays in sync for now.
    UPDATE products SET price_cents = ROUND(price * 100) WHERE price_cents IS NULL;
    UPDATE products
       SET slug = REGEXP_REPLACE(LOWER(name), '[^a-z0-9]+', '-', 'g') || '-' || id
     WHERE slug IS NULL;
    UPDATE products SET stock = 25 WHERE stock = 0 AND in_stock = TRUE;

    ALTER TABLE products ALTER COLUMN price_cents SET NOT NULL;
    ALTER TABLE products ALTER COLUMN slug        SET NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS products_slug_key ON products (slug);

    CREATE TABLE IF NOT EXISTS addresses (
      id          SERIAL      PRIMARY KEY,
      user_id     INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      full_name   TEXT        NOT NULL,
      line1       TEXT        NOT NULL,
      line2       TEXT,
      city        TEXT        NOT NULL,
      region      TEXT        NOT NULL DEFAULT '',
      postal_code TEXT        NOT NULL,
      country     TEXT        NOT NULL,
      phone       TEXT,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS carts (
      id         SERIAL      PRIMARY KEY,
      user_id    INTEGER     UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS cart_items (
      id         SERIAL      PRIMARY KEY,
      cart_id    INTEGER     NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
      product_id INTEGER     NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      quantity   INTEGER     NOT NULL CHECK (quantity > 0),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (cart_id, product_id)
    );

    ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_number        TEXT;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_address_id INTEGER REFERENCES addresses(id) ON DELETE SET NULL;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS subtotal_cents      INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_cents      INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS total_cents         INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS currency            TEXT NOT NULL DEFAULT 'USD';
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW();

    UPDATE orders SET order_number = 'SKB-' || LPAD(id::TEXT, 6, '0') WHERE order_number IS NULL;
    ALTER TABLE orders ALTER COLUMN order_number SET NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS orders_order_number_key ON orders (order_number);

    ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
    ALTER TABLE orders ADD CONSTRAINT orders_status_check
      CHECK (status IN ('pending', 'paid', 'shipped', 'delivered', 'cancelled'));

    CREATE TABLE IF NOT EXISTS order_items (
      id                    SERIAL      PRIMARY KEY,
      order_id              INTEGER     NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      product_id            INTEGER     REFERENCES products(id) ON DELETE SET NULL,
      seller_id             INTEGER     REFERENCES sellers(id) ON DELETE SET NULL,
      product_name          TEXT        NOT NULL,
      product_image_url     TEXT        NOT NULL DEFAULT '',
      unit_price_cents      INTEGER     NOT NULL,
      quantity              INTEGER     NOT NULL CHECK (quantity > 0),
      commission_bps        INTEGER     NOT NULL DEFAULT 0,
      commission_cents      INTEGER     NOT NULL DEFAULT 0,
      seller_earnings_cents INTEGER     NOT NULL DEFAULT 0,
      payout_id             INTEGER,
      created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS order_status_history (
      id         SERIAL      PRIMARY KEY,
      order_id   INTEGER     NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      status     TEXT        NOT NULL,
      note       TEXT,
      actor_id   INTEGER     REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS payments (
      id           SERIAL      PRIMARY KEY,
      order_id     INTEGER     NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      provider     TEXT        NOT NULL DEFAULT 'mock',
      provider_ref TEXT,
      amount_cents INTEGER     NOT NULL,
      currency     TEXT        NOT NULL DEFAULT 'USD',
      status       TEXT        NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'authorized', 'captured', 'failed', 'refunded')),
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS payouts (
      id           SERIAL      PRIMARY KEY,
      seller_id    INTEGER     NOT NULL REFERENCES sellers(id) ON DELETE CASCADE,
      amount_cents INTEGER     NOT NULL,
      currency     TEXT        NOT NULL DEFAULT 'USD',
      status       TEXT        NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'paid', 'failed')),
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      paid_at      TIMESTAMPTZ
    );

    ALTER TABLE order_items DROP CONSTRAINT IF EXISTS order_items_payout_id_fkey;
    ALTER TABLE order_items ADD CONSTRAINT order_items_payout_id_fkey
      FOREIGN KEY (payout_id) REFERENCES payouts(id) ON DELETE SET NULL;

    CREATE INDEX IF NOT EXISTS products_seller_idx        ON products (seller_id);
    CREATE INDEX IF NOT EXISTS products_category_idx      ON products (category);
    CREATE INDEX IF NOT EXISTS products_status_idx        ON products (status);
    CREATE INDEX IF NOT EXISTS orders_user_idx            ON orders (user_id, id DESC);
    CREATE INDEX IF NOT EXISTS orders_status_idx          ON orders (status);
    CREATE INDEX IF NOT EXISTS order_items_order_idx      ON order_items (order_id);
    CREATE INDEX IF NOT EXISTS order_items_seller_idx     ON order_items (seller_id, id DESC);
    CREATE INDEX IF NOT EXISTS order_items_payout_idx     ON order_items (payout_id);
    CREATE INDEX IF NOT EXISTS cart_items_cart_idx        ON cart_items (cart_id);
    CREATE INDEX IF NOT EXISTS status_history_order_idx   ON order_status_history (order_id, id DESC);
    CREATE INDEX IF NOT EXISTS payments_order_idx         ON payments (order_id);
    CREATE INDEX IF NOT EXISTS payouts_seller_idx         ON payouts (seller_id, id DESC);
    CREATE INDEX IF NOT EXISTS addresses_user_idx         ON addresses (user_id);
  `
};

const realtime: Migration = {
  id: '003',
  name: 'orders_notify_trigger',
  sql: `
    CREATE OR REPLACE FUNCTION notify_orders_change()
    RETURNS TRIGGER AS $$
    DECLARE
      payload JSON;
    BEGIN
      IF TG_OP = 'DELETE' THEN
        payload = json_build_object('operation', TG_OP, 'data', row_to_json(OLD), 'timestamp', NOW());
        PERFORM pg_notify('orders_channel', payload::TEXT);
        RETURN OLD;
      ELSE
        payload = json_build_object('operation', TG_OP, 'data', row_to_json(NEW), 'timestamp', NOW());
        PERFORM pg_notify('orders_channel', payload::TEXT);
        RETURN NEW;
      END IF;
    END;
    $$ LANGUAGE plpgsql;

    DROP TRIGGER IF EXISTS orders_change_trigger ON orders;
    CREATE TRIGGER orders_change_trigger
    AFTER INSERT OR UPDATE OR DELETE ON orders
    FOR EACH ROW EXECUTE FUNCTION notify_orders_change();
  `
};

export const migrations: Migration[] = [baseline, marketplace, realtime];
