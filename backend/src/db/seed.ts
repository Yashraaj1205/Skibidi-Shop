import { PoolClient } from 'pg';

const DEMO_SELLER = {
  firebase_uid: 'seed-seller-skibidi-originals',
  email: 'sellers@skibidi.shop',
  display_name: 'Skibidi Originals',
  slug: 'skibidi-originals'
};

const CATALOG = [
  {
    name: 'iPhone 15 Pro Max',
    description:
      'Titanium design with A17 Pro chip, customizable Action button, and 5x Telephoto camera.',
    price_cents: 119999,
    image_url:
      'https://images.unsplash.com/photo-1695048133142-1a20484d2569?w=800&auto=format&fit=crop&q=60',
    category: 'Phones',
    stock: 25
  },
  {
    name: 'MacBook Pro M3',
    description:
      'The ultimate laptop with 14-core CPU, 30-core GPU, 36GB unified memory, and Liquid Retina XDR display.',
    price_cents: 249999,
    image_url:
      'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=800&auto=format&fit=crop&q=60',
    category: 'Laptops',
    stock: 12
  },
  {
    name: 'Sony WH-1000XM5',
    description:
      'Industry-leading noise-canceling wireless headphones with premium sound and crystal-clear calls.',
    price_cents: 34999,
    image_url:
      'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800&auto=format&fit=crop&q=60',
    category: 'Audio',
    stock: 40
  },
  {
    name: 'Keychron Q1 Pro',
    description:
      'Full-aluminum custom mechanical keyboard with hot-swappable switches and RGB backlight.',
    price_cents: 19999,
    image_url:
      'https://images.unsplash.com/photo-1618384887929-16ec33fab9ef?w=800&auto=format&fit=crop&q=60',
    category: 'Peripherals',
    stock: 30
  },
  {
    name: 'Apple Watch Ultra 2',
    description:
      'The most rugged Apple Watch ever built for outdoor adventures and peak athletic performance.',
    price_cents: 79999,
    image_url:
      'https://images.unsplash.com/photo-1434494878577-86c23bcb06b9?w=800&auto=format&fit=crop&q=60',
    category: 'Wearables',
    stock: 18
  },
  {
    name: 'PlayStation 5',
    description:
      'Lightning-fast SSD, haptic feedback, adaptive triggers, and stunning 4K gaming experiences.',
    price_cents: 49999,
    image_url:
      'https://images.unsplash.com/photo-1606813907291-d86efa9b94db?w=800&auto=format&fit=crop&q=60',
    category: 'Gaming',
    stock: 22
  }
];

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

async function ensureDemoSeller(client: PoolClient): Promise<number> {
  const user = await client.query(
    `INSERT INTO users (firebase_uid, email, display_name)
     VALUES ($1, $2, $3)
     ON CONFLICT (firebase_uid) DO UPDATE SET email = EXCLUDED.email
     RETURNING id`,
    [DEMO_SELLER.firebase_uid, DEMO_SELLER.email, DEMO_SELLER.display_name]
  );

  await client.query(
    `INSERT INTO user_roles (user_id, role_id)
     SELECT $1, id FROM roles WHERE key = 'seller'
     ON CONFLICT DO NOTHING`,
    [user.rows[0].id]
  );

  const seller = await client.query(
    `INSERT INTO sellers (user_id, name, slug, description, status, support_email)
     VALUES ($1, $2, $3, $4, 'active', $5)
     ON CONFLICT (user_id) DO UPDATE SET status = 'active'
     RETURNING id`,
    [
      user.rows[0].id,
      DEMO_SELLER.display_name,
      DEMO_SELLER.slug,
      'The house brand: hand-picked electronics shipped straight from the Skibidi warehouse.',
      DEMO_SELLER.email
    ]
  );

  return seller.rows[0].id;
}

export async function seedCatalog(client: PoolClient): Promise<void> {
  const sellerId = await ensureDemoSeller(client);

  // Adopt any pre-marketplace products so every listing has an owner.
  await client.query('UPDATE products SET seller_id = $1 WHERE seller_id IS NULL', [sellerId]);

  const existing = await client.query('SELECT COUNT(*)::INT AS count FROM products');
  if (existing.rows[0].count > 0) return;

  console.log('Seeding product catalog...');
  for (const product of CATALOG) {
    await client.query(
      `INSERT INTO products
         (seller_id, name, slug, description, price, price_cents, image_url, category, stock, in_stock, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, TRUE, 'active')
       ON CONFLICT (slug) DO NOTHING`,
      [
        sellerId,
        product.name,
        slugify(product.name),
        product.description,
        (product.price_cents / 100).toFixed(2),
        product.price_cents,
        product.image_url,
        product.category,
        product.stock
      ]
    );
  }
  console.log('Product catalog seeded');
}
