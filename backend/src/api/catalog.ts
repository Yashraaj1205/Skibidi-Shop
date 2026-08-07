import { Request, Response, Router } from 'express';
import { z } from 'zod';
import { pool } from '../db/pool';
import { asyncHandler } from '../lib/asyncHandler';
import { decodeCursor, paginate } from '../lib/pagination';
import { HttpError } from '../middleware/error';
import { validateParams, validateQuery } from '../middleware/validate';

const router = Router();

const PRODUCT_FIELDS = `
  p.id, p.name, p.slug, p.description, p.price_cents, p.currency, p.image_url,
  p.category, p.stock, p.status, p.created_at,
  s.id AS seller_id, s.name AS seller_name, s.slug AS seller_slug
`;

const listQuery = z.object({
  q: z.string().trim().max(120).optional(),
  category: z.string().trim().max(60).optional(),
  seller: z.string().trim().max(120).optional(),
  min_price_cents: z.coerce.number().int().min(0).optional(),
  max_price_cents: z.coerce.number().int().min(0).optional(),
  in_stock: z.enum(['true', 'false']).optional(),
  sort: z.enum(['newest', 'price_asc', 'price_desc', 'name']).default('newest'),
  limit: z.coerce.number().int().min(1).max(48).default(12),
  cursor: z.string().max(500).optional()
});

type ListQuery = z.infer<typeof listQuery>;

const ORDER_BY: Record<ListQuery['sort'], string> = {
  newest: 'p.id DESC',
  price_asc: 'p.price_cents ASC, p.id ASC',
  price_desc: 'p.price_cents DESC, p.id DESC',
  name: 'p.name ASC, p.id ASC'
};

function keysetCondition(sort: ListQuery['sort'], params: unknown[], cursor: { id: number; sort_value?: number }): string {
  if (sort === 'newest') {
    params.push(cursor.id);
    return `p.id < $${params.length}`;
  }
  if (sort === 'name') {
    params.push(cursor.id);
    return `p.id > $${params.length}`;
  }
  const comparator = sort === 'price_asc' ? '>' : '<';
  params.push(cursor.sort_value ?? 0, cursor.id);
  return `(p.price_cents, p.id) ${comparator} ($${params.length - 1}, $${params.length})`;
}

router.get(
  '/products',
  validateQuery(listQuery),
  asyncHandler(async (req: Request, res: Response) => {
    const query = req.query as unknown as ListQuery;
    const where = [`p.status = 'active'`, `s.status = 'active'`];
    const params: unknown[] = [];

    if (query.q) {
      params.push(`%${query.q}%`);
      where.push(`(p.name ILIKE $${params.length} OR p.description ILIKE $${params.length})`);
    }
    if (query.category) {
      params.push(query.category);
      where.push(`p.category = $${params.length}`);
    }
    if (query.seller) {
      params.push(query.seller);
      where.push(`s.slug = $${params.length}`);
    }
    if (query.min_price_cents !== undefined) {
      params.push(query.min_price_cents);
      where.push(`p.price_cents >= $${params.length}`);
    }
    if (query.max_price_cents !== undefined) {
      params.push(query.max_price_cents);
      where.push(`p.price_cents <= $${params.length}`);
    }
    if (query.in_stock === 'true') where.push('p.stock > 0');

    if (query.cursor) {
      const cursor = decodeCursor(query.cursor);
      if (!cursor) throw new HttpError(400, 'Invalid cursor');
      where.push(keysetCondition(query.sort, params, cursor));
    }

    params.push(query.limit + 1);
    const result = await pool.query(
      `SELECT ${PRODUCT_FIELDS}
         FROM products p
         JOIN sellers s ON s.id = p.seller_id
        WHERE ${where.join(' AND ')}
        ORDER BY ${ORDER_BY[query.sort]}
        LIMIT $${params.length}`,
      params
    );

    res.json(
      paginate(result.rows, query.limit, (row) => ({ id: row.id, sort_value: row.price_cents }))
    );
  })
);

router.get(
  '/categories',
  asyncHandler(async (_req: Request, res: Response) => {
    const result = await pool.query(
      `SELECT p.category AS name, COUNT(*)::INT AS product_count
         FROM products p
         JOIN sellers s ON s.id = p.seller_id
        WHERE p.status = 'active' AND s.status = 'active'
        GROUP BY p.category
        ORDER BY p.category ASC`
    );
    res.json(result.rows);
  })
);

const slugParams = z.object({ slug: z.string().trim().min(1).max(160) });

router.get(
  '/products/:slug',
  validateParams(slugParams),
  asyncHandler(async (req: Request, res: Response) => {
    const result = await pool.query(
      `SELECT ${PRODUCT_FIELDS}, s.description AS seller_description
         FROM products p
         JOIN sellers s ON s.id = p.seller_id
        WHERE p.slug = $1 AND p.status = 'active' AND s.status = 'active'`,
      [req.params.slug]
    );
    if (result.rowCount === 0) throw new HttpError(404, 'Product not found');
    res.json(result.rows[0]);
  })
);

router.get(
  '/sellers/:slug',
  validateParams(slugParams),
  asyncHandler(async (req: Request, res: Response) => {
    const seller = await pool.query(
      `SELECT id, name, slug, description, created_at
         FROM sellers WHERE slug = $1 AND status = 'active'`,
      [req.params.slug]
    );
    if (seller.rowCount === 0) throw new HttpError(404, 'Seller not found');

    const products = await pool.query(
      `SELECT ${PRODUCT_FIELDS}
         FROM products p
         JOIN sellers s ON s.id = p.seller_id
        WHERE s.id = $1 AND p.status = 'active'
        ORDER BY p.id DESC
        LIMIT 48`,
      [seller.rows[0].id]
    );

    res.json({ ...seller.rows[0], products: products.rows });
  })
);

export default router;
