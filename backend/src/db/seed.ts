import { PoolClient } from 'pg';

export interface SeedCategory {
  name: string;
  slug: string;
  icon: string;
}

export const CATEGORIES: SeedCategory[] = [
  { name: 'Phones', slug: 'phones', icon: '📱' },
  { name: 'Laptops', slug: 'laptops', icon: '💻' },
  { name: 'Audio', slug: 'audio', icon: '🎧' },
  { name: 'Peripherals', slug: 'peripherals', icon: '⌨️' },
  { name: 'Wearables', slug: 'wearables', icon: '⌚' },
  { name: 'Gaming', slug: 'gaming', icon: '🎮' },
  { name: 'Cameras', slug: 'cameras', icon: '📷' },
  { name: 'Home & Kitchen', slug: 'home-kitchen', icon: '🏠' },
  { name: 'Fitness & Sports', slug: 'fitness', icon: '🏃' },
  { name: 'Accessories', slug: 'accessories', icon: '🎒' },
  { name: 'Storage & Components', slug: 'storage', icon: '💾' },
  { name: 'Smart Home', slug: 'smart-home', icon: '💡' }
];

interface CategoryProductTemplate {
  categorySlug: string;
  categoryName: string;
  brands: string[];
  productTemplates: {
    namePattern: string;
    descPattern: string;
    basePrice: number;
    priceRange: number;
    images: string[];
    tags: string[];
  }[];
}

const TEMPLATES: CategoryProductTemplate[] = [
  {
    categorySlug: 'phones',
    categoryName: 'Phones',
    brands: ['Apple', 'Samsung', 'Google', 'OnePlus', 'Xiaomi', 'Motorola', 'Sony', 'Nothing'],
    productTemplates: [
      {
        namePattern: '{Brand} {Model} Pro {Tier}',
        descPattern: 'Next-gen flagship smartphone powered by cutting-edge neural processing, ultra-clear dynamic OLED display, and high-resolution camera array.',
        basePrice: 799,
        priceRange: 500,
        images: [
          'https://images.unsplash.com/photo-1592750475338-74b7b21085ab?w=600&auto=format&fit=crop&q=80',
          'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=600&auto=format&fit=crop&q=80',
          'https://images.unsplash.com/photo-1580910051074-3eb694886505?w=600&auto=format&fit=crop&q=80',
          'https://images.unsplash.com/photo-1565849904461-04a58ad377e0?w=600&auto=format&fit=crop&q=80'
        ],
        tags: ['5G', 'Flagship', 'AMOLED', 'Fast Charging']
      },
      {
        namePattern: '{Brand} {Model} Ultra',
        descPattern: 'Engineered for power users with aerospace-grade chassis, 120Hz LTPO display, and all-day endurance battery.',
        basePrice: 999,
        priceRange: 400,
        images: [
          'https://images.unsplash.com/photo-1610945265064-0e34e5519bbf?w=600&auto=format&fit=crop&q=80',
          'https://images.unsplash.com/photo-1575695342320-d2d2d2f9b73f?w=600&auto=format&fit=crop&q=80',
          'https://images.unsplash.com/photo-1546868871-7041f2a55e12?w=600&auto=format&fit=crop&q=80'
        ],
        tags: ['5G', 'Pro Camera', 'Wireless Charging', 'Waterproof']
      }
    ]
  },
  {
    categorySlug: 'laptops',
    categoryName: 'Laptops',
    brands: ['Apple', 'Dell', 'Lenovo', 'ASUS', 'HP', 'Razer', 'Acer', 'MSI'],
    productTemplates: [
      {
        namePattern: '{Brand} {Model} Creator Studio {Tier}',
        descPattern: 'Supercharged performance for creative professionals with high color accuracy display and advanced thermal architecture.',
        basePrice: 1399,
        priceRange: 900,
        images: [
          'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=600&auto=format&fit=crop&q=80',
          'https://images.unsplash.com/photo-1496181133206-80ce9b88a853?w=600&auto=format&fit=crop&q=80',
          'https://images.unsplash.com/photo-1525547719571-a2d4ac8945e2?w=600&auto=format&fit=crop&q=80'
        ],
        tags: ['Creator', 'Retina', 'High Performance', 'Metal Body']
      },
      {
        namePattern: '{Brand} {Model} Stealth Blade {Tier}',
        descPattern: 'Ultra-slim gaming and workstation powerhouse with ultra-fast refresh rates and dedicated GPU acceleration.',
        basePrice: 1599,
        priceRange: 1200,
        images: [
          'https://images.unsplash.com/photo-1603302576837-37561b2e2302?w=600&auto=format&fit=crop&q=80',
          'https://images.unsplash.com/photo-1588872657578-7efd1f1555ed?w=600&auto=format&fit=crop&q=80'
        ],
        tags: ['Gaming', 'RGB', 'RTX', 'High FPS']
      }
    ]
  },
  {
    categorySlug: 'audio',
    categoryName: 'Audio',
    brands: ['Sony', 'Bose', 'Sennheiser', 'Apple', 'JBL', 'Audio-Technica', 'Marshall', 'Shure'],
    productTemplates: [
      {
        namePattern: '{Brand} {Model} Active Noise Cancelling {Tier}',
        descPattern: 'Immersive acoustic architecture with class-leading active noise cancellation, transparency mode, and spatial audio.',
        basePrice: 199,
        priceRange: 200,
        images: [
          'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=600&auto=format&fit=crop&q=80',
          'https://images.unsplash.com/photo-1546435770-a3e426bf472b?w=600&auto=format&fit=crop&q=80',
          'https://images.unsplash.com/photo-1484704849700-f032a568e944?w=600&auto=format&fit=crop&q=80'
        ],
        tags: ['ANC', 'Spatial Audio', 'Bluetooth 5.3', 'Long Battery']
      },
      {
        namePattern: '{Brand} {Model} Studio Wireless Earbuds',
        descPattern: 'True wireless stereo earbuds with crystal call clarity, low latency gaming mode, and water resistance.',
        basePrice: 129,
        priceRange: 150,
        images: [
          'https://images.unsplash.com/photo-1590658268037-6bf12165a8df?w=600&auto=format&fit=crop&q=80',
          'https://images.unsplash.com/photo-1572536147248-ac59a8abfa4b?w=600&auto=format&fit=crop&q=80'
        ],
        tags: ['TWS', 'IPX5', 'Touch Controls', 'Compact']
      }
    ]
  },
  {
    categorySlug: 'peripherals',
    categoryName: 'Peripherals',
    brands: ['Logitech', 'Keychron', 'Razer', 'Corsair', 'SteelSeries', 'Glorious', 'Ducky', 'HyperX'],
    productTemplates: [
      {
        namePattern: '{Brand} {Model} Custom Mechanical Keyboard {Tier}',
        descPattern: 'Anodized aluminum body mechanical keyboard with hot-swappable switches, sound dampening foams, and customizable RGB.',
        basePrice: 119,
        priceRange: 120,
        images: [
          'https://images.unsplash.com/photo-1618384887929-16ec33fab9ef?w=600&auto=format&fit=crop&q=80',
          'https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=600&auto=format&fit=crop&q=80'
        ],
        tags: ['Hot-swap', 'RGB', 'Wireless', 'Ergonomic']
      },
      {
        namePattern: '{Brand} {Model} Ultralight Wireless Mouse',
        descPattern: 'Flawless optical sensor, sub-60g lightweight honeycomb or solid shell design, and optical switches for instant actuation.',
        basePrice: 69,
        priceRange: 90,
        images: [
          'https://images.unsplash.com/photo-1615663245857-ac93bb7c39e7?w=600&auto=format&fit=crop&q=80',
          'https://images.unsplash.com/photo-1527864550417-7fd91fc51a46?w=600&auto=format&fit=crop&q=80'
        ],
        tags: ['Wireless', 'Ultralight', 'High DPI', 'Gaming']
      }
    ]
  },
  {
    categorySlug: 'wearables',
    categoryName: 'Wearables',
    brands: ['Apple', 'Garmin', 'Samsung', 'Fitbit', 'Polar', 'Amazfit', 'Whoop', 'Suunto'],
    productTemplates: [
      {
        namePattern: '{Brand} {Model} Rugged Smartwatch {Tier}',
        descPattern: 'Engineered for athletes and adventurers with multi-band GPS, sapphire crystal glass, titanium bezel, and offline topo maps.',
        basePrice: 349,
        priceRange: 450,
        images: [
          'https://images.unsplash.com/photo-1434494878577-86c23bcb06b9?w=600&auto=format&fit=crop&q=80',
          'https://images.unsplash.com/photo-1508685096489-7aacd43bd3b1?w=600&auto=format&fit=crop&q=80'
        ],
        tags: ['GPS', 'Heart Rate', 'Waterproof 100m', 'Fitness']
      }
    ]
  },
  {
    categorySlug: 'gaming',
    categoryName: 'Gaming',
    brands: ['Sony', 'Microsoft', 'Nintendo', 'Valve', 'ASUS ROG', 'Razer', 'Logitech G', 'Turtle Beach'],
    productTemplates: [
      {
        namePattern: '{Brand} {Model} Gaming Console & Controller Bundle',
        descPattern: 'Next-gen gaming experience with ultra-fast solid state drive, ray tracing support, and immersive haptic feedback.',
        basePrice: 399,
        priceRange: 250,
        images: [
          'https://images.unsplash.com/photo-1606813907291-d86efa9b94db?w=600&auto=format&fit=crop&q=80',
          'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=600&auto=format&fit=crop&q=80',
          'https://images.unsplash.com/photo-1592840496694-26d035b52b48?w=600&auto=format&fit=crop&q=80'
        ],
        tags: ['4K', '120FPS', 'HDR', 'Bundle']
      }
    ]
  },
  {
    categorySlug: 'cameras',
    categoryName: 'Cameras',
    brands: ['Sony', 'Canon', 'Nikon', 'Fujifilm', 'Panasonic', 'GoPro', 'DJI', 'Leica'],
    productTemplates: [
      {
        namePattern: '{Brand} {Model} Mirrorless Camera {Tier}',
        descPattern: 'Full-frame high-speed sensor with advanced AI subject detection autofocus and cinematic 4K 120p recording.',
        basePrice: 1299,
        priceRange: 1400,
        images: [
          'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?w=600&auto=format&fit=crop&q=80',
          'https://images.unsplash.com/photo-1502920917128-1aa500764cbd?w=600&auto=format&fit=crop&q=80',
          'https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?w=600&auto=format&fit=crop&q=80'
        ],
        tags: ['Mirrorless', '4K Video', 'Full Frame', 'OIS']
      }
    ]
  },
  {
    categorySlug: 'home-kitchen',
    categoryName: 'Home & Kitchen',
    brands: ['Dyson', 'Ninja', 'Philips', 'Breville', 'DeLonghi', 'Instant Pot', 'KitchenAid', 'Cosori'],
    productTemplates: [
      {
        namePattern: '{Brand} {Model} Smart Gourmet Multi-Cooker {Tier}',
        descPattern: 'Precision temperature control and rapid air circulation technology for chef-quality meals in minutes.',
        basePrice: 149,
        priceRange: 200,
        images: [
          'https://images.unsplash.com/photo-1584269600464-37b1b58a9fe7?w=600&auto=format&fit=crop&q=80',
          'https://images.unsplash.com/photo-1570222094114-d054a817e56b?w=600&auto=format&fit=crop&q=80'
        ],
        tags: ['Smart Cooking', 'Air Fryer', 'Energy Efficient']
      }
    ]
  },
  {
    categorySlug: 'fitness',
    categoryName: 'Fitness & Sports',
    brands: ['Theragun', 'Bowflex', 'NordicTrack', 'Garmin', 'Under Armour', 'Nike', 'Hydro Flask', 'Gymshark'],
    productTemplates: [
      {
        namePattern: '{Brand} {Model} Pro Deep Muscle Massage Gun',
        descPattern: 'Quiet-force commercial grade brushless motor for deep tissue relief, recovery acceleration, and pain alleviation.',
        basePrice: 189,
        priceRange: 160,
        images: [
          'https://images.unsplash.com/photo-1517838277536-f5f99be501cd?w=600&auto=format&fit=crop&q=80',
          'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=600&auto=format&fit=crop&q=80'
        ],
        tags: ['Recovery', 'Percussive Therapy', 'Quiet', 'Portable']
      }
    ]
  },
  {
    categorySlug: 'accessories',
    categoryName: 'Accessories',
    brands: ['Anker', 'Belkin', 'Peak Design', 'Bellroy', 'Ugreen', 'Nomad', 'Spigen', 'Native Union'],
    productTemplates: [
      {
        namePattern: '{Brand} {Model} GaN III Multi-Device Fast Charger',
        descPattern: 'Gallium Nitride fast charger delivering high wattage power delivery across multiple USB-C ports with thermal guard protection.',
        basePrice: 49,
        priceRange: 60,
        images: [
          'https://images.unsplash.com/photo-1622445262464-84b1456045b6?w=600&auto=format&fit=crop&q=80',
          'https://images.unsplash.com/photo-1583394838336-acd977736f90?w=600&auto=format&fit=crop&q=80'
        ],
        tags: ['GaN', 'USB-C', 'Fast Charging', 'Travel']
      }
    ]
  },
  {
    categorySlug: 'storage',
    categoryName: 'Storage & Components',
    brands: ['Samsung', 'Western Digital', 'Crucial', 'Corsair', 'Seagate', 'Kingston', 'Sabrent', 'SanDisk'],
    productTemplates: [
      {
        namePattern: '{Brand} {Model} NVMe PCIe 4.0 Gen4 M.2 SSD',
        descPattern: 'Blazing read/write speeds exceeding 7000MB/s, nickel-coated controller, and heat-spreader label for peak endurance.',
        basePrice: 89,
        priceRange: 130,
        images: [
          'https://images.unsplash.com/photo-1597872200969-2b65d56bd16b?w=600&auto=format&fit=crop&q=80',
          'https://images.unsplash.com/photo-1544652478-6653e09f18a2?w=600&auto=format&fit=crop&q=80'
        ],
        tags: ['NVMe', '7000MB/s', 'PCIe 4.0', 'High Speed']
      }
    ]
  },
  {
    categorySlug: 'smart-home',
    categoryName: 'Smart Home',
    brands: ['Philips Hue', 'Amazon Ring', 'Google Nest', 'Nanoleaf', 'Ecobee', 'Eufy', 'Aqara', 'TP-Link Kasa'],
    productTemplates: [
      {
        namePattern: '{Brand} {Model} Smart Security & Ambiance Hub',
        descPattern: 'Matter and Thread enabled smart automation hub with 16 million colors, voice assistant control, and end-to-end encryption.',
        basePrice: 79,
        priceRange: 100,
        images: [
          'https://images.unsplash.com/photo-1558002038-1055907df827?w=600&auto=format&fit=crop&q=80',
          'https://images.unsplash.com/photo-1507646227500-4d389b0012be?w=600&auto=format&fit=crop&q=80'
        ],
        tags: ['Matter', 'WiFi 6', 'Voice Assistant', 'Home Automation']
      }
    ]
  }
];

const MODEL_MODIFIERS = [
  'Alpha', 'Prime', 'Apex', 'Phantom', 'Nexus', 'Vortex', 'Zenith', 'Titan',
  'Pulse', 'Fusion', 'Nova', 'Infinity', 'Quantum', 'Stealth', 'Spectre',
  'Force', 'Evo', 'Max', 'Pro', 'Elite', 'Matrix', 'Horizon', 'Velocity'
];

const TIERS = ['SE', 'V2', 'Plus', 'Ultra', 'Max', 'Edition', 'Carbon', 'Special Edition'];

export async function seedCatalog(client: PoolClient): Promise<void> {
  // 1. Seed categories
  const categoryMap = new Map<string, number>();
  for (const cat of CATEGORIES) {
    const res = await client.query(
      `INSERT INTO categories (name, slug, icon)
       VALUES ($1, $2, $3)
       ON CONFLICT (name) DO UPDATE SET slug = EXCLUDED.slug, icon = EXCLUDED.icon
       RETURNING id, slug`,
      [cat.name, cat.slug, cat.icon]
    );
    categoryMap.set(res.rows[0].slug, res.rows[0].id);
  }

  // 2. Check current product count
  const countRes = await client.query('SELECT COUNT(*) FROM products');
  const currentCount = parseInt(countRes.rows[0].count, 10);
  if (currentCount >= 400) {
    console.log(`Catalog already populated with ${currentCount} products.`);
    return;
  }

  console.log(`Seeding catalog with 500+ diverse products across 12 categories...`);

  // Target: at least ~45 products per category to reach > 500 products
  for (const tmpl of TEMPLATES) {
    const categoryId = categoryMap.get(tmpl.categorySlug) || null;
    const targetPerCategory = 44; // 12 * 44 = 528 products!

    let created = 0;
    while (created < targetPerCategory) {
      for (const brand of tmpl.brands) {
        if (created >= targetPerCategory) break;

        const subTmpl = tmpl.productTemplates[created % tmpl.productTemplates.length];
        const model = MODEL_MODIFIERS[(created * 3 + tmpl.brands.indexOf(brand)) % MODEL_MODIFIERS.length];
        const tier = TIERS[(created + 2) % TIERS.length];

        const name = subTmpl.namePattern
          .replace('{Brand}', brand)
          .replace('{Model}', model)
          .replace('{Tier}', tier);

        const priceDelta = ((created * 37) % 100) / 100 * subTmpl.priceRange;
        const price = Math.round((subTmpl.basePrice + priceDelta) * 100) / 100;
        const hasDiscount = (created % 3 === 0);
        const discountPct = hasDiscount ? (Math.floor((created % 5) * 5) + 10) : 0;
        const originalPrice = discountPct > 0 ? Math.round(price / (1 - discountPct / 100) * 100) / 100 : price;

        const rating = Math.round((3.8 + ((created % 12) / 10)) * 10) / 10;
        const cappedRating = Math.min(5.0, rating);
        const reviewCount = (created * 73 + 18) % 3500 + 12;
        const stockQuantity = (created % 11 === 0) ? 0 : ((created * 29) % 250 + 15);
        const inStock = stockQuantity > 0;

        const imgIndex = created % subTmpl.images.length;
        const mainImage = subTmpl.images[imgIndex];
        const allImages = subTmpl.images;

        const tags = Array.from(new Set([brand, tmpl.categoryName, ...subTmpl.tags]));

        await client.query(
          `INSERT INTO products (
            name, description, price, original_price, discount_pct,
            image_url, image_urls, category, category_id,
            brand, rating, review_count, tags, stock_quantity, in_stock, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW() - ($16 || ' days')::INTERVAL)
          ON CONFLICT DO NOTHING`,
          [
            name,
            subTmpl.descPattern,
            price,
            originalPrice,
            discountPct,
            mainImage,
            allImages,
            tmpl.categoryName,
            categoryId,
            brand,
            cappedRating,
            reviewCount,
            tags,
            stockQuantity,
            inStock,
            created % 90
          ]
        );

        created++;
      }
    }
  }

  const finalCountRes = await client.query('SELECT COUNT(*) FROM products');
  console.log(`Seeding complete! Total products in catalog: ${finalCountRes.rows[0].count}`);
}
