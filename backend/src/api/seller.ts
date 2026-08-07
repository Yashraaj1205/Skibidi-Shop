import { Response, Router } from 'express';
import { z } from 'zod';
import { pool } from '../db/pool';
import { asyncHandler } from '../lib/asyncHandler';
import { slugify } from '../db/seed';
import {
  AuthenticatedRequest,
  authenticateToken,
  currentUser,
  requireSeller
} from '../middleware/auth';
import { HttpError } from '../middleware/error';
import { validateBody, validateParams, validateQuery } from '../middleware/validate';

const router = Router();

router.use(authenticateToken);

const application = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(2000).default(''),
  support_email: z.string().trim().email().max(200).optional(),
  payout_email: z.string().trim().email().max(200).optional()
});

router.post(
  '/apply',
  validateBody(application),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const user = currentUser(req);
    if (user.seller_id !== null) throw new HttpError(409, 'Seller account already exists');

    const body = req.body as z.infer<typeof application>;
    const slug = `${slugify(body.name)}-${user.user_id}`;

    const seller = await pool.query(
      `INSERT INTO sellers (user_id, name, slug, description, support_email, payout_email)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [
        user.user_id,
        body.name,
        slug,
        body.description,
        body.support_email || user.email,
        body.payout_email || user.email
      ]
    );

    await pool.query(
      `INSERT INTO user_roles (user_id, role_id) SELECT $1, id FROM roles WHERE key = 'seller'
       ON CONFLICT DO NOTHING`,
      [user.user_id]
    );

    res.status(201).json(seller.rows[0]);
  })
);

router.get(
  '/me',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const user = currentUser(req);
    if (user.seller_id === null) throw new HttpError(404, 'No seller account');

    const seller = await pool.query('SELECT * FROM sellers WHERE id = $1', [user.seller_id]);
    res.json(seller.rows[0]);
  })
);

router.use(requireSeller);

const listing = z.object({
  name: z.string().trim().min(2).max(200),
  description: z.string().trim().min(1).max(4000),
  price_cents: z.coerce.number().int().min(50).max(100_000_000),
  image_url: z.string().trim().url().max(500),
  category: z.string().trim().min(1).max(60),
  stock: z.coerce.number().int().min(0).max(100_000).default(0),
  status: z.enum(['draft', 'active', 'archived']).default('draft')
});

const listingUpdate = listing.partial();
const idParams = z.object({ id: z.coerce.number().int().positive() });

router.get(
  '/products',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const result = await pool.query(
      `SELECT id, name, slug, description, price_cents, currency, image_url, category,
              stock, status, created_at, updated_at
         FROM products WHERE seller_id = $1 ORDER BY id DESC`,
      [currentUser(req).seller_id]
    );
    res.json(result.rows);
  })
);

router.post(
  '/products',
  validateBody(listing),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const sellerId = currentUser(req).seller_id;
    const body = req.body as z.infer<typeof listing>;

    const result = await pool.query(
      `INSERT INTO products
         (seller_id, name, slug, description, price, price_cents, image_url, category,
          stock, in_stock, status)
       VALUES ($1, $2, $3 || '-' || SUBSTR(MD5(RANDOM()::TEXT), 1, 6), $4, $5, $6, $7, $8, $9, $9 > 0, $10)
       RETURNING *`,
      [
        sellerId,
        body.name,
        slugify(body.name),
        body.description,
        (body.price_cents / 100).toFixed(2),
        body.price_cents,
        body.image_url,
        body.category,
        body.stock,
        body.status
      ]
    );
    res.status(201).json(result.rows[0]);
  })
);

router.patch(
  '/products/:id',
  validateParams(idParams),
  validateBody(listingUpdate),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const body = req.body as z.infer<typeof listingUpdate>;
    const entries = Object.entries(body).filter(([, value]) => value !== undefined);
    if (entries.length === 0) throw new HttpError(400, 'No fields to update');

    const params: unknown[] = [currentUser(req).seller_id, req.params.id];
    const assignments: string[] = [];

    for (const [column, value] of entries) {
      params.push(value);
      assignments.push(`${column} = $${params.length}`);
      if (column === 'price_cents') {
        assignments.push(`price = ($${params.length}::NUMERIC / 100)`);
      }
      if (column === 'stock') {
        assignments.push(`in_stock = $${params.length} > 0`);
      }
    }

    const result = await pool.query(
      `UPDATE products SET ${assignments.join(', ')}, updated_at = NOW()
        WHERE seller_id = $1 AND id = $2 RETURNING *`,
      params
    );
    if (result.rowCount === 0) throw new HttpError(404, 'Listing not found');
    res.json(result.rows[0]);
  })
);

router.delete(
  '/products/:id',
  validateParams(idParams),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    // Archive rather than delete: order history references the listing.
    const result = await pool.query(
      `UPDATE products SET status = 'archived', in_stock = FALSE, updated_at = NOW()
        WHERE seller_id = $1 AND id = $2 RETURNING id`,
      [currentUser(req).seller_id, req.params.id]
    );
    if (result.rowCount === 0) throw new HttpError(404, 'Listing not found');
    res.status(204).send();
  })
);

const orderQuery = z.object({
  status: z.enum(['pending', 'paid', 'shipped', 'delivered', 'cancelled']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25)
});

router.get(
  '/orders',
  validateQuery(orderQuery),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const query = req.query as unknown as z.infer<typeof orderQuery>;
    const params: unknown[] = [currentUser(req).seller_id];
    let statusFilter = '';
    if (query.status) {
      params.push(query.status);
      statusFilter = `AND o.status = $${params.length}`;
    }
    params.push(query.limit);

    const result = await pool.query(
      `SELECT oi.id, oi.order_id, oi.product_name, oi.quantity, oi.unit_price_cents,
              oi.commission_cents, oi.seller_earnings_cents, oi.payout_id,
              o.order_number, o.status, o.customer_name, o.created_at
         FROM order_items oi
         JOIN orders o ON o.id = oi.order_id
        WHERE oi.seller_id = $1 ${statusFilter}
        ORDER BY oi.id DESC
        LIMIT $${params.length}`,
      params
    );
    res.json(result.rows);
  })
);

router.get(
  '/metrics',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const sellerId = currentUser(req).seller_id;
    const result = await pool.query(
      `SELECT
         COUNT(DISTINCT oi.order_id)::INT                                     AS order_count,
         COALESCE(SUM(oi.unit_price_cents * oi.quantity), 0)::INT             AS gross_cents,
         COALESCE(SUM(oi.commission_cents), 0)::INT                           AS commission_cents,
         COALESCE(SUM(oi.seller_earnings_cents), 0)::INT                      AS earnings_cents,
         COALESCE(SUM(CASE WHEN oi.payout_id IS NULL
                           THEN oi.seller_earnings_cents ELSE 0 END), 0)::INT AS unpaid_cents
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
      WHERE oi.seller_id = $1 AND o.status <> 'cancelled'`,
      [sellerId]
    );

    const listings = await pool.query(
      `SELECT COUNT(*)::INT AS total,
              COUNT(*) FILTER (WHERE status = 'active')::INT AS active,
              COUNT(*) FILTER (WHERE stock = 0)::INT         AS out_of_stock
         FROM products WHERE seller_id = $1`,
      [sellerId]
    );

    res.json({ ...result.rows[0], listings: listings.rows[0] });
  })
);

router.get(
  '/payouts',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const result = await pool.query(
      'SELECT * FROM payouts WHERE seller_id = $1 ORDER BY id DESC LIMIT 50',
      [currentUser(req).seller_id]
    );
    res.json(result.rows);
  })
);

export default router;
