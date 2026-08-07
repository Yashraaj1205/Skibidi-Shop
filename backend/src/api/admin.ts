import { Response, Router } from 'express';
import { z } from 'zod';
import { pool } from '../db/pool';
import { asyncHandler } from '../lib/asyncHandler';
import { decodeCursor, paginate } from '../lib/pagination';
import {
  AuthenticatedRequest,
  authenticateToken,
  currentUser,
  requireAdmin
} from '../middleware/auth';
import { HttpError } from '../middleware/error';
import { validateBody, validateParams, validateQuery } from '../middleware/validate';
import { runPayouts } from '../services/payouts';
import { ORDER_STATUSES } from '../types';

const status = z.enum(['pending', 'paid', 'shipped', 'delivered', 'cancelled']);
const idParams = z.object({ id: z.coerce.number().int().positive() });

export const ordersRouter = Router();

ordersRouter.use(authenticateToken, requireAdmin);

const orderQuery = z.object({
  status: status.optional(),
  q: z.string().trim().max(120).optional(),
  seller_id: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().max(500).optional()
});

ordersRouter.get(
  '/',
  validateQuery(orderQuery),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const query = req.query as unknown as z.infer<typeof orderQuery>;
    const where: string[] = ['TRUE'];
    const params: unknown[] = [];

    if (query.status) {
      params.push(query.status);
      where.push(`o.status = $${params.length}`);
    }
    if (query.q) {
      params.push(`%${query.q}%`);
      where.push(
        `(o.customer_name ILIKE $${params.length} OR o.customer_email ILIKE $${params.length} OR o.order_number ILIKE $${params.length})`
      );
    }
    if (query.seller_id !== undefined) {
      params.push(query.seller_id);
      where.push(
        `EXISTS (SELECT 1 FROM order_items oi WHERE oi.order_id = o.id AND oi.seller_id = $${params.length})`
      );
    }
    if (query.cursor) {
      const cursor = decodeCursor(query.cursor);
      if (!cursor) throw new HttpError(400, 'Invalid cursor');
      params.push(cursor.id);
      where.push(`o.id < $${params.length}`);
    }

    params.push(query.limit + 1);
    const result = await pool.query(
      `SELECT o.*,
              (SELECT COUNT(*)::INT FROM order_items oi WHERE oi.order_id = o.id) AS item_count
         FROM orders o
        WHERE ${where.join(' AND ')}
        ORDER BY o.id DESC
        LIMIT $${params.length}`,
      params
    );

    res.json(paginate(result.rows, query.limit, (row) => ({ id: row.id })));
  })
);

const manualOrder = z.object({
  customer_name: z.string().trim().min(1).max(120),
  product_name: z.string().trim().min(1).max(200),
  customer_email: z.string().trim().email().max(200).nullish().default(null),
  status: status.default('pending')
});

ordersRouter.post(
  '/',
  validateBody(manualOrder),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const body = req.body as z.infer<typeof manualOrder>;
    const inserted = await pool.query(
      `INSERT INTO orders
         (order_number, customer_name, customer_email, product_name, status, updated_at)
       VALUES ('provisional-' || MD5(RANDOM()::TEXT || CLOCK_TIMESTAMP()::TEXT), $1, $2, $3, $4, NOW())
       RETURNING id`,
      [body.customer_name, body.customer_email, body.product_name, body.status]
    );
    const result = await pool.query(
      `UPDATE orders SET order_number = 'SKB-' || LPAD(id::TEXT, 6, '0') WHERE id = $1 RETURNING *`,
      [inserted.rows[0].id]
    );
    res.status(201).json(result.rows[0]);
  })
);

ordersRouter.get(
  '/:id',
  validateParams(idParams),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const order = await pool.query('SELECT * FROM orders WHERE id = $1', [req.params.id]);
    if (order.rowCount === 0) throw new HttpError(404, 'Order not found');

    const [items, history, address, payment] = await Promise.all([
      pool.query(
        `SELECT oi.*, s.name AS seller_name
           FROM order_items oi LEFT JOIN sellers s ON s.id = oi.seller_id
          WHERE oi.order_id = $1 ORDER BY oi.id ASC`,
        [req.params.id]
      ),
      pool.query(
        'SELECT status, note, created_at FROM order_status_history WHERE order_id = $1 ORDER BY id ASC',
        [req.params.id]
      ),
      pool.query('SELECT * FROM addresses WHERE id = $1', [order.rows[0].shipping_address_id]),
      pool.query('SELECT * FROM payments WHERE order_id = $1 ORDER BY id DESC LIMIT 1', [
        req.params.id
      ])
    ]);

    res.json({
      ...order.rows[0],
      items: items.rows,
      history: history.rows,
      shipping_address: address.rowCount === 0 ? null : address.rows[0],
      payment: payment.rowCount === 0 ? null : payment.rows[0]
    });
  })
);

const statusUpdate = z.object({
  status,
  note: z.string().trim().max(500).optional()
});

ordersRouter.patch(
  '/:id',
  validateParams(idParams),
  validateBody(statusUpdate),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const user = currentUser(req);
    const body = req.body as z.infer<typeof statusUpdate>;

    const result = await pool.query(
      'UPDATE orders SET status = $2, updated_at = NOW() WHERE id = $1 RETURNING *',
      [req.params.id, body.status]
    );
    if (result.rowCount === 0) throw new HttpError(404, 'Order not found');

    await pool.query(
      `INSERT INTO order_status_history (order_id, status, note, actor_id)
       VALUES ($1, $2, $3, $4)`,
      [req.params.id, body.status, body.note || null, user.user_id]
    );

    res.json(result.rows[0]);
  })
);

ordersRouter.delete(
  '/:id',
  validateParams(idParams),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const result = await pool.query('DELETE FROM orders WHERE id = $1 RETURNING id', [
      req.params.id
    ]);
    if (result.rowCount === 0) throw new HttpError(404, 'Order not found');
    res.status(204).send();
  })
);

const router = Router();

router.use(authenticateToken, requireAdmin);
router.use('/orders', ordersRouter);

const sellerQuery = z.object({
  status: z.enum(['pending', 'active', 'suspended']).optional()
});

router.get(
  '/sellers',
  validateQuery(sellerQuery),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const query = req.query as unknown as z.infer<typeof sellerQuery>;
    const params: unknown[] = [];
    let filter = '';
    if (query.status) {
      params.push(query.status);
      filter = `WHERE s.status = $${params.length}`;
    }

    const result = await pool.query(
      `SELECT s.*, u.email AS owner_email, u.display_name AS owner_name,
              (SELECT COUNT(*)::INT FROM products p WHERE p.seller_id = s.id) AS listing_count,
              (SELECT COALESCE(SUM(oi.seller_earnings_cents), 0)::INT
                 FROM order_items oi WHERE oi.seller_id = s.id) AS earnings_cents
         FROM sellers s JOIN users u ON u.id = s.user_id
         ${filter}
        ORDER BY s.id DESC`,
      params
    );
    res.json(result.rows);
  })
);

const sellerUpdate = z
  .object({
    status: z.enum(['pending', 'active', 'suspended']).optional(),
    commission_bps: z.coerce.number().int().min(0).max(5000).optional()
  })
  .refine((body) => body.status !== undefined || body.commission_bps !== undefined, {
    message: 'Provide status or commission_bps'
  });

router.patch(
  '/sellers/:id',
  validateParams(idParams),
  validateBody(sellerUpdate),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const body = req.body as z.infer<typeof sellerUpdate>;
    const params: unknown[] = [req.params.id];
    const assignments: string[] = [];

    if (body.status !== undefined) {
      params.push(body.status);
      assignments.push(`status = $${params.length}`);
    }
    if (body.commission_bps !== undefined) {
      params.push(body.commission_bps);
      assignments.push(`commission_bps = $${params.length}`);
    }

    const result = await pool.query(
      `UPDATE sellers SET ${assignments.join(', ')}, updated_at = NOW()
        WHERE id = $1 RETURNING *`,
      params
    );
    if (result.rowCount === 0) throw new HttpError(404, 'Seller not found');
    res.json(result.rows[0]);
  })
);

router.get(
  '/metrics',
  asyncHandler(async (_req: AuthenticatedRequest, res: Response) => {
    const totals = await pool.query(
      `SELECT COUNT(*)::INT                                       AS order_count,
              COALESCE(SUM(total_cents), 0)::INT                  AS gross_cents,
              COUNT(*) FILTER (WHERE status = 'pending')::INT      AS pending_count,
              COUNT(*) FILTER (WHERE status = 'delivered')::INT    AS delivered_count,
              COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days')::INT AS orders_7d
         FROM orders`
    );
    const commission = await pool.query(
      `SELECT COALESCE(SUM(commission_cents), 0)::INT      AS commission_cents,
              COALESCE(SUM(seller_earnings_cents), 0)::INT AS seller_earnings_cents
         FROM order_items`
    );
    const counts = await pool.query(
      `SELECT (SELECT COUNT(*)::INT FROM sellers)                          AS seller_count,
              (SELECT COUNT(*)::INT FROM sellers WHERE status = 'pending') AS pending_sellers,
              (SELECT COUNT(*)::INT FROM products WHERE status = 'active') AS active_listings,
              (SELECT COUNT(*)::INT FROM users)                            AS user_count`
    );
    const byStatus = await pool.query(
      `SELECT status, COUNT(*)::INT AS count FROM orders GROUP BY status`
    );

    const statusCounts: Record<string, number> = {};
    for (const key of ORDER_STATUSES) statusCounts[key] = 0;
    for (const row of byStatus.rows) statusCounts[row.status] = row.count;

    res.json({
      ...totals.rows[0],
      ...commission.rows[0],
      ...counts.rows[0],
      orders_by_status: statusCounts
    });
  })
);

router.get(
  '/payouts',
  asyncHandler(async (_req: AuthenticatedRequest, res: Response) => {
    const result = await pool.query(
      `SELECT p.*, s.name AS seller_name
         FROM payouts p JOIN sellers s ON s.id = p.seller_id
        ORDER BY p.id DESC LIMIT 100`
    );
    res.json(result.rows);
  })
);

router.post(
  '/payouts/run',
  asyncHandler(async (_req: AuthenticatedRequest, res: Response) => {
    res.status(201).json(await runPayouts());
  })
);

const payoutUpdate = z.object({ status: z.enum(['pending', 'paid', 'failed']) });

router.patch(
  '/payouts/:id',
  validateParams(idParams),
  validateBody(payoutUpdate),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const result = await pool.query(
      `UPDATE payouts
          SET status = $2,
              paid_at = CASE WHEN $2 = 'paid' THEN NOW() ELSE paid_at END
        WHERE id = $1 RETURNING *`,
      [req.params.id, req.body.status]
    );
    if (result.rowCount === 0) throw new HttpError(404, 'Payout not found');
    res.json(result.rows[0]);
  })
);

export default router;
