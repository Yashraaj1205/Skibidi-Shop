import { Router, Request, Response } from 'express';
import { pool } from '../db/pool';
import { respondWithServerError } from '../utils/http';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth';

const router = Router();

// GET /api/categories - List all categories with product count
router.get('/categories', async (_req: Request, res: Response) => {
  try {
    const result = await pool.query(`
      SELECT c.*, COUNT(p.id)::INTEGER AS product_count
      FROM categories c
      LEFT JOIN products p ON p.category_id = c.id
      GROUP BY c.id
      ORDER BY c.name ASC
    `);
    res.json(result.rows);
  } catch (err) {
    respondWithServerError(res, 'Categories fetch failed', err);
  }
});

// GET /api/products/meta/filters - Get aggregate metadata for filter sidebar (brands, price min/max, categories)
router.get('/meta/filters', async (_req: Request, res: Response) => {
  try {
    const brandsRes = await pool.query(`
      SELECT DISTINCT brand, COUNT(*)::INTEGER AS count
      FROM products
      WHERE brand IS NOT NULL AND brand != ''
      GROUP BY brand
      ORDER BY count DESC, brand ASC
    `);

    const priceRes = await pool.query(`
      SELECT
        COALESCE(MIN(price), 0)::FLOAT AS min_price,
        COALESCE(MAX(price), 3000)::FLOAT AS max_price
      FROM products
    `);

    const catRes = await pool.query(`
      SELECT c.slug, c.name, c.icon, COUNT(p.id)::INTEGER AS count
      FROM categories c
      LEFT JOIN products p ON p.category_id = c.id
      GROUP BY c.id
      ORDER BY count DESC
    `);

    res.json({
      brands: brandsRes.rows,
      price: priceRes.rows[0],
      categories: catRes.rows
    });
  } catch (err) {
    respondWithServerError(res, 'Filters meta fetch failed', err);
  }
});

// GET /api/products - Advanced search, filtering, sorting, and pagination
router.get('/', async (req: Request, res: Response) => {
  try {
    const {
      q,
      category,
      brand,
      minPrice,
      maxPrice,
      inStock,
      sort,
      page = '1',
      limit = '24'
    } = req.query;

    const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10) || 24));
    const offset = (pageNum - 1) * limitNum;

    const conditions: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;
    let searchParamIndex = -1;

    // 1. Instant prefix, word-start, brand, and full-text search
    if (q && typeof q === 'string' && q.trim().length > 0) {
      const cleanQ = q.trim();
      searchParamIndex = paramIndex;
      conditions.push(`(
        p.name ILIKE $${paramIndex}
        OR p.name ILIKE $${paramIndex + 1}
        OR p.brand ILIKE $${paramIndex}
        OR p.category ILIKE $${paramIndex}
        OR search_vector @@ plainto_tsquery('english', $${paramIndex + 2})
      )`);
      values.push(cleanQ + '%', '% ' + cleanQ + '%', cleanQ);
      paramIndex += 3;
    }

    // 2. Category filter (by slug or name)
    if (category && typeof category === 'string' && category.trim().length > 0 && category !== 'all') {
      conditions.push(`(
        p.category_id IN (SELECT id FROM categories WHERE slug = $${paramIndex} OR LOWER(name) = LOWER($${paramIndex}))
        OR LOWER(p.category) = LOWER($${paramIndex})
      )`);
      values.push(category.trim());
      paramIndex++;
    }

    // 3. Brand filter (supports comma-separated multiple brands)
    if (brand && typeof brand === 'string' && brand.trim().length > 0) {
      const brandList = brand.split(',').map(b => b.trim()).filter(Boolean);
      if (brandList.length > 0) {
        conditions.push(`p.brand = ANY($${paramIndex})`);
        values.push(brandList);
        paramIndex++;
      }
    }

    // 4. Price range
    if (minPrice !== undefined && minPrice !== '') {
      const minVal = parseFloat(minPrice as string);
      if (!isNaN(minVal)) {
        conditions.push(`p.price >= $${paramIndex}`);
        values.push(minVal);
        paramIndex++;
      }
    }

    if (maxPrice !== undefined && maxPrice !== '') {
      const maxVal = parseFloat(maxPrice as string);
      if (!isNaN(maxVal)) {
        conditions.push(`p.price <= $${paramIndex}`);
        values.push(maxVal);
        paramIndex++;
      }
    }

    // 5. In-stock filter
    if (inStock === 'true' || inStock === '1') {
      conditions.push(`p.in_stock = TRUE`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // 6. Sorting
    let orderBy = 'p.id ASC';
    switch (sort) {
      case 'price_asc':
        orderBy = 'p.price ASC';
        break;
      case 'price_desc':
        orderBy = 'p.price DESC';
        break;
      case 'rating':
        orderBy = 'p.rating DESC NULLS LAST, p.review_count DESC';
        break;
      case 'newest':
        orderBy = 'p.created_at DESC, p.id DESC';
        break;
      case 'discount':
        orderBy = 'p.discount_pct DESC, p.id ASC';
        break;
      default:
        if (searchParamIndex !== -1) {
          // Rank items whose name starts with query first, then word prefix, then brand prefix
          orderBy = `(CASE WHEN p.name ILIKE $${searchParamIndex} THEN 1 WHEN p.name ILIKE $${searchParamIndex + 1} THEN 2 WHEN p.brand ILIKE $${searchParamIndex} THEN 3 ELSE 4 END), p.rating DESC, p.id ASC`;
        } else {
          orderBy = 'p.id ASC';
        }
    }

    // Count total query
    const countSql = `SELECT COUNT(*)::INTEGER AS total FROM products p ${whereClause}`;
    const countResult = await pool.query(countSql, values);
    const total = countResult.rows[0]?.total || 0;

    // Fetch paginated products
    const dataSql = `
      SELECT
        p.id, p.name, p.description, p.price, p.original_price, p.discount_pct,
        p.image_url, p.image_urls, p.category, p.category_id,
        p.brand, p.rating, p.review_count, p.tags, p.stock_quantity, p.in_stock, p.created_at
      FROM products p
      ${whereClause}
      ORDER BY ${orderBy}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    values.push(limitNum, offset);
    const dataResult = await pool.query(dataSql, values);

    res.json({
      products: dataResult.rows,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum) || 1
    });
  } catch (err) {
    respondWithServerError(res, 'Products fetch failed', err);
  }
});

// GET /api/products/:id - Single product detail
router.get('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const result = await pool.query(`
      SELECT p.*, c.name AS category_name, c.slug AS category_slug
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE p.id = $1
    `, [id]);

    if (result.rowCount === 0) {
      res.status(404).json({ error: 'Product not found' });
      return;
    }

    res.json(result.rows[0]);
  } catch (err) {
    respondWithServerError(res, `Failed to fetch product ${id}`, err);
  }
});

// GET /api/products/:id/reviews - Reviews for a product
router.get('/:id/reviews', async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const result = await pool.query(`
      SELECT r.id, r.rating, r.comment, r.created_at,
             u.display_name AS user_name, u.photo_url AS user_photo
      FROM reviews r
      JOIN users u ON r.user_id = u.id
      WHERE r.product_id = $1
      ORDER BY r.created_at DESC
    `, [id]);
    res.json(result.rows);
  } catch (err) {
    respondWithServerError(res, `Failed to fetch reviews for product ${id}`, err);
  }
});

// POST /api/products/:id/reviews - Submit review (Authenticated)
router.post('/:id/reviews', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const { id } = req.params;
  const { rating, comment } = req.body;

  const numRating = parseInt(rating, 10);
  if (isNaN(numRating) || numRating < 1 || numRating > 5) {
    res.status(400).json({ error: 'Rating must be an integer between 1 and 5' });
    return;
  }

  if (!comment || typeof comment !== 'string' || comment.trim().length === 0) {
    res.status(400).json({ error: 'Comment is required' });
    return;
  }

  try {
    const userRes = await pool.query('SELECT id, display_name FROM users WHERE firebase_uid = $1', [req.user.firebase_uid]);
    if (userRes.rowCount === 0) {
      res.status(400).json({ error: 'User profile not found. Please sync profile first.' });
      return;
    }
    const userId = userRes.rows[0].id;

    const insertRes = await pool.query(`
      INSERT INTO reviews (product_id, user_id, rating, comment, created_at)
      VALUES ($1, $2, $3, $4, NOW())
      RETURNING *
    `, [id, userId, numRating, comment.trim()]);

    // Recalculate average rating & review count for product
    await pool.query(`
      UPDATE products
      SET
        rating = COALESCE((SELECT ROUND(AVG(rating)::NUMERIC, 1) FROM reviews WHERE product_id = $1), 4.5),
        review_count = (SELECT COUNT(*) FROM reviews WHERE product_id = $1)
      WHERE id = $1
    `, [id]);

    res.status(201).json(insertRes.rows[0]);
  } catch (err) {
    respondWithServerError(res, 'Failed to submit review', err);
  }
});

export default router;
